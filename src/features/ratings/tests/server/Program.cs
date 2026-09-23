using System.Text.Json;
using Jellyfin.Plugin.JellyfinEnhanced.Model;
using Jellyfin.Plugin.JellyfinEnhanced.Services;

var checks = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException(name);
    checks++;
}

using (var doc = JsonDocument.Parse("""
    {"ratings":[
        {"source":"tmdb","value":58,"score":60,"votes":123,"url":"/movie/42"},
        {"source":"imdb","value":7.2,"votes":"123","url":123},
        {"source":"tomatoes","score":88,"fresh":1},
        {"source":"","score":99}, {"source":123}, {"score":80}
    ], "score":71, "ids":{"tmdb":42,"imdb":"tt123","mal":0,"empty":"","null":null,"unsupported":true}}
    """))
{
    var entry = MdblistResponseParser.ParseResponse(doc, 1234);
    Check(entry.Found && entry.Confirmed && entry.FetchedAtUnixMs == 1234, "successful rating lookup is a timestamped confirmed hit");
    Check(entry.Ratings.Count == 4, "invalid sources skipped and aggregate synthesized");
    Check(entry.Ratings[0].Value == 58 && entry.Ratings[0].Score == 60 && entry.Ratings[0].Votes == 123, "provider numeric values preserved");
    Check(entry.Ratings[1].Url == null && entry.Ratings[1].Votes == null, "numeric URL and string vote counts remain absent");
    Check(entry.Ratings[2].Fresh == 1 && entry.Ratings[3].Source == "master" && entry.Ratings[3].Score == 71, "freshness and aggregate preserved");
    Check(entry.Ids.Count == 3 && entry.Ids["tmdb"] == "42" && entry.Ids["imdb"] == "tt123" && entry.Ids["mal"] == "0", "provider IDs normalize only number and nonempty string values");
    Check(JsonSerializer.Serialize(entry) == JsonSerializer.Serialize(MdblistResponseParser.ParseMediaItem(doc.RootElement, 1234)), "single and batch item projection agree");
}
using (var missing = JsonDocument.Parse("{\"response\":false,\"error\":\"not found\"}"))
{
    var entry = MdblistResponseParser.ParseResponse(missing, 5678);
    Check(!entry.Found && entry.Confirmed && entry.FetchedAtUnixMs == 5678 && entry.Ratings.Count == 0, "explicit no match is a confirmed negative");
}
using (var empty = JsonDocument.Parse("{}"))
{
    var entry = MdblistResponseParser.ParseResponse(empty, 99);
    Check(entry.Found && entry.Confirmed && entry.Ratings.Count == 0, "successful empty object retains upstream hit semantics");
    var status = MdblistResponseParser.ParseAccountStatus(empty.RootElement, 10);
    Check(status.Plan == "" && !status.IsSupporter && status.RateLimitRemaining == 0 && status.FetchedAtUnixMs == 10, "missing account data retains zero defaults");
}
using (var account = JsonDocument.Parse("""
    {"plan":"supporter","is_supporter":true,"rate_limit":1000,"rate_limit_remaining":987,"rate_limit_reset":1900000000}
    """))
{
    var status = MdblistResponseParser.ParseAccountStatus(account.RootElement, 42);
    Check(status.Plan == "supporter" && status.IsSupporter && status.RateLimit == 1000 && status.RateLimitRemaining == 987 && status.RateLimitResetUnixSeconds == 1900000000 && status.FetchedAtUnixMs == 42, "account data maps without changing units");
}

using (var doc = JsonDocument.Parse("""
    {"results":{"bindings":[
      {"awardLabel":{"value":"Award"},"result":{"value":"Won"},"year":{"value":"2025"},"personLabel":{"value":"Alice"},"workLabel":{"value":"Film A"}},
      {"awardLabel":{"value":"Award"},"result":{"value":"Won"},"year":{"value":"2025"},"personLabel":{"value":"Alice"},"workLabel":{"value":"Film A"}},
      {"awardLabel":{"value":"Award"},"result":{"value":"Nominated"},"year":{"value":"2025"},"personLabel":{"value":"Bob"},"workLabel":{"value":"Film B"}},
      {"awardLabel":{"value":"Older"},"result":{"value":"Nominated"},"year":{"value":"2024"},"personLabel":{"value":"Q123"}},
      {"awardLabel":{"value":"Honor"},"result":{"value":"Won"},"year":{"value":"unknown"}},
      {"awardLabel":{"value":"Q456"},"result":{"value":"Won"}},
      {"awardLabel":{"value":"No result"}}
    ]}}
    """))
{
    var title = WikidataAwardsQuery.ParseResults(doc, 123, false);
    Check(title.Found && title.Confirmed && title.Wins == 2 && title.Nominations == 1 && title.FetchedAtUnixMs == 123, "awards count excludes redundant nominations and unlabeled entities");
    Check(title.Awards.Select(a => a.Name).SequenceEqual(new[] { "Award", "Older", "Honor" }), "awards sorted newest first with unknown year last");
    Check(title.Awards[0].Recipients.SequenceEqual(new[] { "Alice", "Bob" }) && title.Awards[0].Works.Count == 0, "title awards deduplicate and merge nomination recipients");
    Check(title.Awards[1].Recipients.Count == 0 && title.Awards[2].Year == null, "raw entity IDs and invalid years are omitted");
    var person = WikidataAwardsQuery.ParseResults(doc, 456, true);
    Check(person.Awards[0].Works.SequenceEqual(new[] { "Film A", "Film B" }) && person.Awards[0].Recipients.Count == 0, "person awards collect works instead of recipients");
}
using (var doc = JsonDocument.Parse("{\"results\":{\"bindings\":[]}}"))
{
    var entry = WikidataAwardsQuery.ParseResults(doc, 123, false);
    Check(!entry.Found && entry.Confirmed && entry.Wins == 0 && entry.Nominations == 0, "empty SPARQL result is a confirmed miss");
}
Check(WikidataAwardsQuery.BuildTitleQuery("tv", "12").Contains("wdt:P4983 \"12\""), "TV lookup uses television TMDB property");
Check(WikidataAwardsQuery.BuildTitleQuery("movie", "12").Contains("wdt:P4947 \"12\""), "movie lookup uses film TMDB property");
Check(WikidataAwardsQuery.BuildPersonQuery("12").Contains("wdt:P4985 \"12\""), "person lookup uses person TMDB property");
Check(WikidataAwardsQuery.BuildPersonQuery("a\"b\\c").Contains("\"a\\\"b\\\\c\""), "SPARQL IDs escape quotes and backslashes");

Console.WriteLine($"Passed {checks} ratings checks.");
