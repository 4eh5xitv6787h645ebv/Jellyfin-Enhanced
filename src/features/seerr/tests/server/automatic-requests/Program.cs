using System.Net;
using System.Text;
using System.Text.Json;
using Jellyfin.Plugin.JellyfinEnhanced;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;

await MovieContracts();
await SeasonContracts();
Console.WriteLine("Automatic request contracts passed (public service entry points, controlled HTTP responses).");

static void Check(bool condition, string description)
{
    if (!condition) throw new Exception(description);
}

static async Task MovieContracts()
{
    var f = new Fixture();
    var service = f.Movies();
    await service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    Check(f.Posts.Count == 1 && f.Posts[0].Body == "{\"mediaType\":\"movie\",\"mediaId\":11}", "Default movie request payload changed");
    Check(f.Posts[0].User == "42", "Mapped Seerr user header required");
    await service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    Check(f.Posts.Count == 1, "Duplicate movie request was submitted");
    service.ClearRequestCache();
    await service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    Check(f.Posts.Count == 2 && f.UserLookups == 1, "Request cache reset must preserve the independent user mapping cache");

    foreach (var status in new[] { 2, 3, 5 })
    {
        f = new Fixture { MovieStatus = status };
        await f.Movies().CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
        Check(f.Posts.Count == 0, $"Movie status {status} must suppress requests");
    }
    f = new Fixture { ReleaseDate = "9999-01-01" };
    f.Config.AutoMovieRequestCheckReleaseDate = true;
    service = f.Movies();
    await service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    Check(f.Posts.Count == 0, "Future movie release must be skipped when configured");
    f.Config.AutoMovieRequestCheckReleaseDate = false;
    await service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    Check(f.Posts.Count == 1, "Future movie release is requestable when release checking is disabled");

    f = new Fixture { FailPosts = true };
    service = f.Movies();
    await service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    f.FailPosts = false;
    await service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    Check(f.Posts.Count == 2, "Failed movie requests must release their reservation");

    f = new Fixture();
    f.Config.JellyseerrUrls = " https://failed.example/ ,\r\n https://seerr.example/// ";
    f.Config.AutoMovieRequestQualityMode = "custom";
    f.Config.AutoMovieRequestCustomServerId = 0;
    f.Config.AutoMovieRequestCustomProfileId = 8;
    f.Config.AutoMovieRequestCustomRootFolder = "/movies";
    await f.Movies().CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    using (var payload = JsonDocument.Parse(f.Posts.Single().Body))
    {
        Check(payload.RootElement.GetProperty("serverId").GetInt32() == 0, "Zero server ID is valid");
        Check(payload.RootElement.GetProperty("profileId").GetInt32() == 8, "Custom profile must be preserved");
        Check(payload.RootElement.GetProperty("rootFolder").GetString() == "/movies", "Custom root folder must be preserved");
    }
    Check(f.FailedHostCalls >= 3, "Collection/user/submission must independently fail over through configured URLs");

    f = new Fixture();
    f.Config.AutoMovieRequestQualityMode = "original";
    service = f.Movies();
    await service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    Check(f.Posts[0].Body.Contains("\"is4k\":true"), "Inherited quality profile must preserve 4K");
    service.ClearRequestCache();
    f.Config.AutoMovieRequestFallbackOn4k = true;
    await service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    Check(f.Posts[1].Body == "{\"mediaType\":\"movie\",\"mediaId\":11}", "4K fallback must omit all inherited quality settings");

    f = new Fixture { MissingUser = true };
    service = f.Movies();
    await service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    f.MissingUser = false;
    await service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    Check(f.UserLookups == 2 && f.Posts.Count == 1, "Missing user mappings must not be cached");

    f = new Fixture { PostGate = new(TaskCreationOptions.RunContinuationsAsynchronously) };
    service = f.Movies();
    var first = service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    await f.PostStarted.Task;
    await service.CheckMovieForCollectionRequestAsync(new Movie(), f.User.Id);
    Check(f.Posts.Count == 1, "Concurrent movie check must see reserved request before HTTP completes");
    f.PostGate.SetResult();
    await first;
}

static async Task SeasonContracts()
{
    var f = new Fixture();
    var service = f.Seasons();
    await service.CheckEpisodeCompletionAsync(f.Episode(7), f.User.Id);
    Check(f.Posts.Count == 0, "Season threshold must use remaining episode count");
    await service.CheckEpisodeCompletionAsync(f.Episode(8), f.User.Id);
    Check(f.Posts.Single().Body == "{\"mediaType\":\"tv\",\"mediaId\":10,\"seasons\":[2]}", "Season request payload changed");
    Check(f.SeriesLookups == 2, "Episode counts should use cache while availability checks must fetch fresh");
    await service.CheckEpisodeCompletionAsync(f.Episode(9), f.OtherUser.Id);
    Check(f.Posts.Count == 1, "Season reservations must deduplicate across users");

    f = new Fixture();
    f.Config.JellyseerrDisableCache = true;
    await f.Seasons().CheckEpisodeCompletionAsync(f.Episode(8), f.User.Id);
    Check(f.SeriesLookups == 3, "Disabling response cache requires separate current/next/status requests");

    foreach (var state in new[] { "available", "requested", "not-started", "missing" })
    {
        f = new Fixture { SeasonStatus = state == "available" ? 5 : 1, SeasonRequested = state == "requested", NextSeasonEpisodes = state == "not-started" ? 0 : 5, TotalSeasons = state == "missing" ? 1 : 2 };
        await f.Seasons().CheckEpisodeCompletionAsync(f.Episode(8), f.User.Id);
        Check(f.Posts.Count == 0, $"Season {state} must suppress requests");
    }

    f = new Fixture { NextSeasonEpisodes = 0 };
    f.Config.JellyseerrDisableCache = true;
    service = f.Seasons();
    await service.CheckEpisodeCompletionAsync(f.Episode(8), f.User.Id);
    f.NextSeasonEpisodes = 5;
    await service.CheckEpisodeCompletionAsync(f.Episode(8), f.User.Id);
    Check(f.Posts.Count == 1, "Not-started seasons must release reservation for later retries");

    f = new Fixture { FailPosts = true };
    service = f.Seasons();
    await service.CheckEpisodeCompletionAsync(f.Episode(8), f.User.Id);
    f.FailPosts = false;
    await service.CheckEpisodeCompletionAsync(f.Episode(8), f.User.Id);
    Check(f.Posts.Count == 2 && f.UserLookups == 1, "Failed season requests retry while preserving user mapping cache");

    f = new Fixture { PriorEpisodePlayed = false };
    f.Config.AutoSeasonRequestRequireAllWatched = true;
    service = f.Seasons();
    await service.CheckEpisodeCompletionAsync(f.Episode(8), f.User.Id);
    Check(f.Posts.Count == 0, "Unwatched prior episode blocks request");
    f.PriorEpisodePlayed = true;
    await service.CheckEpisodeCompletionAsync(f.Episode(8), f.User.Id);
    Check(f.Posts.Count == 1, "Watched prior episodes permit request");
}

sealed class Fixture : HttpMessageHandler, IHttpClientFactory, IUserManager, ILibraryManager, IUserDataManager
{
    public PluginConfiguration Config { get; } = new();
    public JUser User { get; } = new() { Id = Guid.Parse("AABBCCDD-1111-2222-3333-444455556666") };
    public JUser OtherUser { get; } = new() { Id = Guid.NewGuid() };
    public int MovieStatus { get; set; } = 1;
    public string ReleaseDate { get; set; } = "2000-01-01";
    public bool FailPosts { get; set; }
    public bool MissingUser { get; set; }
    public int SeasonStatus { get; set; } = 1;
    public bool SeasonRequested { get; set; }
    public int NextSeasonEpisodes { get; set; } = 5;
    public int TotalSeasons { get; set; } = 2;
    public bool PriorEpisodePlayed { get; set; } = true;
    public int SeriesLookups { get; private set; }
    public int UserLookups { get; private set; }
    public int FailedHostCalls { get; private set; }
    public List<(string Body, string User)> Posts { get; } = [];
    public TaskCompletionSource? PostGate { get; set; }
    public TaskCompletionSource PostStarted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public Fixture() => JellyfinEnhanced.Instance = new() { Configuration = Config };
    public AutoMovieRequestService Movies() => new(this, new Logger(), this, this);
    public AutoSeasonRequestService Seasons() => new(this, new Logger(), this, this, this);
    public Episode Episode(int number) => new() { Series = new(), ParentIndexNumber = 1, IndexNumber = number };
    public HttpClient CreateClient(string name) => new(this, disposeHandler: false);
    public JUser? GetUserById(Guid id) => id == User.Id ? User : id == OtherUser.Id ? OtherUser : null;
    public ItemsResult GetItemsResult(InternalItemsQuery query) => new() { Items = [Episode(1), Episode(8)] };
    public UserData? GetUserData(JUser user, BaseItem item) => new() { Played = PriorEpisodePlayed };
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (request.RequestUri!.Host == "failed.example")
        {
            FailedHostCalls++;
            return Json("{}", HttpStatusCode.BadGateway);
        }
        var path = request.RequestUri.AbsolutePath;
        if (path.StartsWith("/3/movie/")) return Json("{\"belongs_to_collection\":{\"id\":777,\"name\":\"Collection\"}}");
        if (!request.Headers.TryGetValues("X-Api-Key", out var keys) || keys.Single() != "seerr-key") throw new Exception("Missing API key");
        if (path == "/api/v1/collection/777") return Json(JsonSerializer.Serialize(new { parts = new object[] { new { id = 10 }, new { id = 11, title = "Next", releaseDate = ReleaseDate, mediaInfo = new { status = MovieStatus } } } }));
        if (path == "/api/v1/movie/10") return Json("{\"mediaInfo\":{\"requests\":[{\"profileId\":8,\"serverId\":0,\"rootFolder\":\"/movies\",\"is4k\":true}]}}");
        if (path == "/api/v1/user")
        {
            UserLookups++;
            if (request.RequestUri.Query != "?take=1000") throw new Exception("User lookup paging contract changed");
            return Json(JsonSerializer.Serialize(new { results = MissingUser ? [] : new[] { new { jellyfinUserId = User.Id.ToString("N").ToUpperInvariant(), id = 42 } } }));
        }
        if (path == "/api/v1/tv/10")
        {
            SeriesLookups++;
            return Json(JsonSerializer.Serialize(new { numberOfSeasons = TotalSeasons, seasons = new[] { new { seasonNumber = 1, episodeCount = 10, status = 5 }, new { seasonNumber = 2, episodeCount = NextSeasonEpisodes, status = SeasonStatus } }, mediaInfo = new { requests = SeasonRequested ? new[] { new { seasons = new[] { new { seasonNumber = 2 } } } } : [] } }));
        }
        if (path == "/api/v1/request" && request.Method == HttpMethod.Post)
        {
            Posts.Add((await request.Content!.ReadAsStringAsync(cancellationToken), request.Headers.GetValues("X-Api-User").Single()));
            PostStarted.TrySetResult();
            if (PostGate != null) await PostGate.Task;
            return Json("{}", FailPosts ? HttpStatusCode.BadRequest : HttpStatusCode.Created);
        }
        throw new Exception($"Unexpected HTTP request: {request.Method} {request.RequestUri}");
    }
    static HttpResponseMessage Json(string body, HttpStatusCode code = HttpStatusCode.OK) => new(code) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
}
