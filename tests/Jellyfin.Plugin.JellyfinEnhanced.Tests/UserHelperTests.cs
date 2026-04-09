using System;
using System.Collections.Generic;
using System.Security.Claims;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests
{
    /// <summary>
    /// Unit tests for UserHelper. These lock in the authorization semantics
    /// used by every per-user endpoint in the controller. A regression here
    /// would silently let one user read another user's config, so this is
    /// one of the higher-value test surfaces.
    /// </summary>
    public class UserHelperTests
    {
        private const string AdminUserId = "11111111-2222-3333-4444-555555555555";
        private const string NormalUserId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

        private static ClaimsPrincipal BuildPrincipal(string? userId, bool isAdmin)
        {
            var claims = new List<Claim>();
            if (!string.IsNullOrEmpty(userId))
            {
                claims.Add(new Claim("Jellyfin-UserId", userId));
            }
            if (isAdmin)
            {
                claims.Add(new Claim(ClaimTypes.Role, "Administrator"));
            }
            var identity = new ClaimsIdentity(claims, "test");
            return new ClaimsPrincipal(identity);
        }

        [Fact]
        public void GetCurrentUserId_Returns_Null_For_Unauthenticated()
        {
            var principal = BuildPrincipal(userId: null, isAdmin: false);
            Assert.Null(UserHelper.GetCurrentUserId(principal));
        }

        [Fact]
        public void GetCurrentUserId_Parses_Valid_Guid()
        {
            var principal = BuildPrincipal(userId: AdminUserId, isAdmin: false);
            var result = UserHelper.GetCurrentUserId(principal);
            Assert.Equal(Guid.Parse(AdminUserId), result);
        }

        [Fact]
        public void GetCurrentUserId_Returns_Null_For_Invalid_Guid()
        {
            var principal = BuildPrincipal(userId: "not-a-guid", isAdmin: false);
            Assert.Null(UserHelper.GetCurrentUserId(principal));
        }

        [Fact]
        public void GetUserId_Allows_Self_Access_For_Non_Admin()
        {
            var principal = BuildPrincipal(userId: NormalUserId, isAdmin: false);
            var requestedId = Guid.Parse(NormalUserId);
            var result = UserHelper.GetUserId(principal, requestedId);
            Assert.Equal(requestedId, result);
        }

        [Fact]
        public void GetUserId_Denies_Cross_User_Access_For_Non_Admin()
        {
            // Non-admin tries to read another user's config — must return null
            // (signal to the controller to Forbid()).
            var principal = BuildPrincipal(userId: NormalUserId, isAdmin: false);
            var otherUserId = Guid.Parse(AdminUserId);
            var result = UserHelper.GetUserId(principal, otherUserId);
            Assert.Null(result);
        }

        [Fact]
        public void GetUserId_Allows_Cross_User_Access_For_Admin()
        {
            // Admin is allowed to read any user's config.
            var principal = BuildPrincipal(userId: AdminUserId, isAdmin: true);
            var otherUserId = Guid.Parse(NormalUserId);
            var result = UserHelper.GetUserId(principal, otherUserId);
            Assert.Equal(otherUserId, result);
        }

        [Fact]
        public void GetUserId_Empty_Requested_Defaults_To_Current()
        {
            // If the caller passes no specific userId, the controller action
            // resolves to the current user — this is the implicit "my own
            // settings" path used by the user settings panel.
            var principal = BuildPrincipal(userId: NormalUserId, isAdmin: false);
            var result = UserHelper.GetUserId(principal, Guid.Empty);
            Assert.Equal(Guid.Parse(NormalUserId), result);
        }

        [Fact]
        public void GetUserId_Unauthenticated_Returns_Null()
        {
            var principal = BuildPrincipal(userId: null, isAdmin: false);
            var result = UserHelper.GetUserId(principal, Guid.Parse(NormalUserId));
            Assert.Null(result);
        }
    }
}
