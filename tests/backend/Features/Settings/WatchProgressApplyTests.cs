using System.Text.Json;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Settings;
using Jellyfin.Plugin.JellyfinEnhanced.Shared.Maintenance;
using Microsoft.AspNetCore.Mvc;

namespace JE.Tests.Features.Settings;

/// <summary>
/// Watch Progress Default and Time Format are personal settings (WatchProgressMode, WatchProgressTimeFormat) seeded from
/// the admin's defaults. The config page's two ways of applying the admin's values to existing users use them too.
/// </summary>
[Collection("Plugin singleton")]
public class WatchProgressApplyTests
{
    private const string User = "abcdefabcdefabcdefabcdefabcdefab";

    private static JeSettingsController Controller(ApiPluginFixture f, bool admin)
    {
        var maintenance = new MaintenanceModeService(Moq.Mock.Of<MediaBrowser.Controller.Library.IUserManager>(), Moq.Mock.Of<MediaBrowser.Controller.Session.ISessionManager>(), f.Core.Paths.Object, f.Core.Logger);
        var controller = (JeSettingsController)ApiAssetTests.Controller(typeof(JeSettingsController), f.Core, maintenance, f.Core.Manager);
        controller.HttpContext.User = global::JE.Tests.Features.SpoilerGuard.PrivacyPolicyTests.Principal(admin ? Guid.NewGuid() : Guid.ParseExact(User, "N"), admin);
        return controller;
    }

    /// <summary>A user who saved their own settings with the shipped watch-progress values; the admin then picks others.</summary>
    private static ApiPluginFixture SavedUserThenNewDefaults()
    {
        var f = new ApiPluginFixture();
        Assert.IsType<OkObjectResult>(Controller(f, admin: false).GetUserSettingsSettings(User));
        var own = f.Core.Manager.GetUserConfiguration<JellyfinEnhancedUserSettings>(User, "settings.json");
        Assert.Equal(("percentage", "hours"), (own.WatchProgressMode, own.WatchProgressTimeFormat));
        f.Plugin.Configuration.WatchProgressDefaultMode = "remaining";
        f.Plugin.Configuration.WatchProgressTimeFormat = "full";
        return f;
    }

    [Fact]
    public void ApplyAllPluginSettingsGivesEveryUserTheAdminsWatchProgressDefaults()
    {
        using var f = SavedUserThenNewDefaults();
        Assert.IsType<OkObjectResult>(Controller(f, admin: true).ResetAllUsersSettings());
        var after = f.Core.Manager.GetUserConfiguration<JellyfinEnhancedUserSettings>(User, "settings.json");
        Assert.Equal(("remaining", "full"), (after.WatchProgressMode, after.WatchProgressTimeFormat));
    }

    [Fact]
    public void ApplyTheAboveCopiesTheWatchProgressDefaultIntoTheUsersMode()
    {
        using var f = SavedUserThenNewDefaults();
        var result = Assert.IsType<OkObjectResult>(Controller(f, admin: true).ApplyUserSettings(new JeSettingsController.ApplyUserSettingsRequest
        {
            Properties = new List<string> { "WatchProgressDefaultMode", "WatchProgressTimeFormat" },
        }));
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(result.Value));
        Assert.Empty(json.RootElement.GetProperty("unsupported").EnumerateArray());
        var after = f.Core.Manager.GetUserConfiguration<JellyfinEnhancedUserSettings>(User, "settings.json");
        Assert.Equal(("remaining", "full"), (after.WatchProgressMode, after.WatchProgressTimeFormat));
    }
}
