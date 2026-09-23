using System.Reflection;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

// Exercise the actual plugin assembly and Jellyfin DTOs. Reflection keeps these
// implementation collaborators internal without test-only production APIs.
var assembly = typeof(SpoilerFieldStripFilter).Assembly;
var sanitizerType = assembly.GetType("Jellyfin.Plugin.JellyfinEnhanced.Services.SpoilerMetadataSanitizer", true)!;
var sanitizer = Activator.CreateInstance(sanitizerType, BindingFlags.Instance | BindingFlags.NonPublic,
    null, new object?[] { null }, null)!;
var apply = sanitizerType.GetMethod("ApplyStripping", BindingFlags.Instance | BindingFlags.NonPublic)!;
var defaultReveal = Activator.CreateInstance(apply.GetParameters()[4].ParameterType);
var passed = 0;

void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
void Run(string name, Action test)
{
    test();
    passed++;
    Console.WriteLine($"PASS {name}");
}
void Strip(BaseItemDto item, PluginConfiguration cfg, SpoilerBlurUserPrefs? prefs = null)
    => apply.Invoke(sanitizer, new object?[] { item, new UserSpoilerBlur { Prefs = prefs ?? new SpoilerBlurUserPrefs() }, cfg, Guid.Empty, defaultReveal });

Run("title and placeholder policy", () =>
{
    var item = new BaseItemDto { Type = BaseItemKind.Episode, Name = "A reveal", IndexNumber = 4,
        ParentIndexNumber = 2, Overview = "A plot", OriginalTitle = "A reveal", SortName = "A reveal" };
    Strip(item, new PluginConfiguration { SpoilerOverviewPlaceholder = "<b>Hidden</b>&\"'`<>" });
    Check(item.Name == "Season 2, Episode 4" && item.OriginalTitle == null && item.SortName == null,
        "Episode title fields must be scrubbed together.");
    Check(item.Overview == "Hidden", "Placeholder must retain the existing HTML sanitation.");
});
Run("user opt-out and admin cap", () =>
{
    foreach (var admin in new[] { false, true })
    foreach (var user in new bool?[] { null, false, true })
    {
        var item = new BaseItemDto { Type = BaseItemKind.Episode, Overview = "original" };
        Strip(item, new PluginConfiguration { SpoilerStripOverview = admin },
            new SpoilerBlurUserPrefs { HideEpisodeDescriptions = user });
        Check((item.Overview != "original") == (admin && user != false), "Admin and user policy changed.");
    }
});
Run("series overview is independent", () =>
{
    var cfg = new PluginConfiguration { SpoilerStripOverview = false, SpoilerStripSeriesOverview = true };
    var series = new BaseItemDto { Type = BaseItemKind.Series, Overview = "series" };
    var episode = new BaseItemDto { Type = BaseItemKind.Episode, Overview = "episode" };
    Strip(series, cfg);
    Strip(episode, cfg);
    Check(series.Overview == cfg.SpoilerOverviewPlaceholder && episode.Overview == "episode", "Series policy coupled to episodes.");
    series.Overview = "series";
    Strip(series, cfg, new SpoilerBlurUserPrefs { HideSeriesDescriptions = false });
    Check(series.Overview == "series", "Series user opt-out ignored.");
});
Run("movie chapter boundary retains only earlier chapters", () =>
{
    var item = new BaseItemDto { Type = BaseItemKind.Movie, Name = "Movie", UserData = new UserItemDataDto { Key = "test", PlaybackPositionTicks = 100 },
        Chapters = [
            new ChapterInfo { Name = "Earlier", ImagePath = "/earlier", StartPositionTicks = 0 },
            new ChapterInfo { Name = "Boundary", ImagePath = "/boundary", StartPositionTicks = 100 },
            new ChapterInfo { Name = "Later", ImagePath = "/later", StartPositionTicks = 200 }
        ] };
    Strip(item, new PluginConfiguration());
    Check(item.Name == "Movie", "Movie titles must remain visible.");
    Check(item.Chapters[0].Name == "Earlier" && item.Chapters[0].ImagePath == "/earlier", "Earlier chapters must remain visible.");
    Check(item.Chapters[1].Name == "Chapter 2" && item.Chapters[1].ImagePath == null, "Exact resume boundary must remain protected.");
    Check(item.Chapters[2].Name == "Chapter 3" && item.Chapters[2].ImagePath == null, "Future chapters must remain protected.");
});
Run("subtitle playback URLs and media source labels", () =>
{
    foreach (var kind in new[] { BaseItemKind.Movie, BaseItemKind.Episode })
    {
        var local = new MediaStream { IsExternal = true, IsExternalUrl = false, Path = "/spoiler.srt", Title = "spoiler", Comment = "spoiler", DeliveryUrl = "/Subtitles/0/Stream.srt" };
        var remote = new MediaStream { IsExternal = true, IsExternalUrl = true, Path = "/spoiler.srt", DeliveryUrl = "https://remote/spoiler.srt" };
        var embedded = new MediaStream { IsExternal = false, DeliveryUrl = "/Subtitles/1/Stream.srt", Title = "spoiler" };
        var item = new BaseItemDto { Type = kind, UserData = new UserItemDataDto { Key = "test" }, MediaStreams = new[] { local },
            MediaSources = new[] { new MediaSourceInfo { Path = "/spoiler.mkv", Name = "Director's Cut", MediaStreams = new[] { remote, embedded } } } };
        Strip(item, new PluginConfiguration());
        Check(local.Path == null && local.Title == null && local.Comment == null && local.DeliveryUrl == "/Subtitles/0/Stream.srt", "Local external subtitle playback URL lost.");
        Check(remote.Path == null && remote.DeliveryUrl == null, "Raw remote subtitle filename leaked.");
        Check(embedded.DeliveryUrl == "/Subtitles/1/Stream.srt" && embedded.Title == null, "Embedded playback URL lost.");
        Check(item.MediaSources[0].Path == null, "Media source path leaked.");
        Check(item.MediaSources[0].Name == (kind == BaseItemKind.Movie ? "Director's Cut" : null), "Movie version-label policy changed.");
    }
});
Run("image tags preserve versions and vary by watched state", () =>
{
    var id = Guid.NewGuid();
    BaseItemDto Item() => new() { Id = id, ImageTags = new Dictionary<ImageType, string> { [ImageType.Primary] = "v1" }, BackdropImageTags = new[] { "backdrop" } };
    var cfg = new PluginConfiguration { SpoilerBlurEnabled = true, SpoilerBlurArtwork = true };
    var unwatched = Item(); var watched = Item();
    SpoilerFieldStripFilter.MutateImageTagsForCacheBust(unwatched, cfg, false, 0);
    SpoilerFieldStripFilter.MutateImageTagsForCacheBust(watched, cfg, true, 0);
    Check(unwatched.ImageTags[ImageType.Primary].EndsWith("-v1"), "Jellyfin version suffix lost.");
    Check(unwatched.ImageTags[ImageType.Primary] != watched.ImageTags[ImageType.Primary], "Watched state must change cache token.");
    Check(unwatched.BackdropImageTags[0].StartsWith("sb-"), "Protected backdrop cache was not busted.");
    var once = unwatched.ImageTags[ImageType.Primary];
    SpoilerFieldStripFilter.MutateImageTagsForCacheBust(unwatched, cfg, false, 0);
    Check(unwatched.ImageTags[ImageType.Primary] == once, "Repeated traversal must not prefix tags twice.");
    var clear = Item(); cfg.SpoilerBlurArtwork = false;
    SpoilerFieldStripFilter.MutateImageTagsForCacheBust(clear, cfg, false, 0);
    Check(clear.BackdropImageTags[0] == "backdrop", "Unprotected backdrops must keep original tags.");
});
Run("advanced category reveals do not broaden other categories", () =>
{
    var item = new BaseItemDto { Type = BaseItemKind.Episode, Name = "title", Overview = "plot",
        CommunityRating = 8, IndexNumber = 2, ParentIndexNumber = 2, Tags = new[] { "spoiler tag" } };
    var reveal = Activator.CreateInstance(apply.GetParameters()[4].ParameterType,
        BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
        null, new object[] { true, true, true }, null);
    apply.Invoke(sanitizer, new object?[] { item, new UserSpoilerBlur(), new PluginConfiguration(), Guid.Empty, reveal });
    Check(item.Name == "title" && item.Overview == "plot" && item.CommunityRating == 8, "Revealed categories were stripped.");
    Check(item.Tags.Length == 0, "Category reveal must not expose tags.");
});
Run("lazy response items are materialized before MVC serialization", () =>
{
    var processorType = assembly.GetType("Jellyfin.Plugin.JellyfinEnhanced.Services.SpoilerMetadataResponseProcessor", true)!;
    var processor = Activator.CreateInstance(processorType, BindingFlags.Instance | BindingFlags.NonPublic,
        null, new object?[5], null)!;
    var process = processorType.GetMethod("StripIfApplicable", BindingFlags.Instance | BindingFlags.NonPublic)!;
    var id = Guid.NewGuid();
    var state = new UserSpoilerBlur();
    state.Series[id.ToString("N")] = new SpoilerBlurSeriesEntry();
    var enumerations = 0;
    IEnumerable<BaseItemDto> FreshItems()
    {
        enumerations++;
        yield return new BaseItemDto { Id = id, Type = BaseItemKind.Series, Overview = "plot" };
    }
    var result = new ObjectResult(FreshItems());
    process.Invoke(processor, new object?[] { result, state, new PluginConfiguration(), Guid.Empty, null });
    var serializedItem = ((IEnumerable<BaseItemDto>)result.Value!).Single();
    Check(enumerations == 1, "MVC would enumerate fresh, unprotected DTOs.");
    Check(serializedItem.Overview == "Spoiler Guard activated", "Materialized response lost metadata protection.");
});
Run("image cache headers distinguish chapter previews", () =>
{
    var writerType = assembly.GetType("Jellyfin.Plugin.JellyfinEnhanced.Services.SpoilerImageResponseWriter", true)!;
    var setHeaders = writerType.GetMethod("ApplyNoStoreHeadersDirect", BindingFlags.Static | BindingFlags.NonPublic)!;
    foreach (var imageType in new[] { "Primary", "Chapter" })
    {
        var context = new DefaultHttpContext();
        context.Response.Headers.ETag = "public-version";
        context.Response.Headers.LastModified = "yesterday";
        setHeaders.Invoke(null, new object[] { context, imageType });
        Check(context.Response.Headers.CacheControl == (imageType == "Chapter"
            ? "private, max-age=30, must-revalidate" : "private, no-store, max-age=0, must-revalidate"), "Image cache policy changed.");
        Check(!context.Response.Headers.ContainsKey("ETag") && !context.Response.Headers.ContainsKey("Last-Modified"), "Public validators survived cache protection.");
    }
});
Console.WriteLine($"{passed} Spoiler Guard regression checks passed.");
