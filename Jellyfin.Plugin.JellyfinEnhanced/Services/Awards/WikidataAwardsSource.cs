using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Model.Awards;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Fetches the structured, per-award breakdown (category, ceremony, year, people,
    /// winner-vs-nominee) from the Wikidata Query Service.
    /// </summary>
    /// <remarks>
    /// Wikidata was chosen for the detail list because it is the only free source that
    /// is both structured and unrestricted: no API key, CC0-licensed data, and — unlike
    /// TMDB's awards pages — full coverage of pre-1997 ceremonies, which matters for the
    /// back catalogue that fills most Jellyfin libraries.
    ///
    /// Awards are modelled two ways in Wikidata and both must be queried or most acting
    /// and directing awards go missing:
    ///   (a) on the work itself   — work P166 (award received) / P1411 (nominated for)
    ///   (b) on a person          — person P166/P1411 &lt;award&gt; qualified by P1686 ("for work") = the work
    /// The four-way UNION below covers both directions for both statuses.
    /// </remarks>
    public class WikidataAwardsSource
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;

        public const string SourceName = "wikidata";

        private const string Endpoint = "https://query.wikidata.org/sparql";

        /// <summary>
        /// Serialises outbound queries and enforces a minimum gap between them.
        /// </summary>
        /// <remarks>
        /// The Wikidata Query Service is a donated public resource with a documented
        /// user-agent and concurrency policy. A library-wide refresh must look like a
        /// polite trickle, not a burst, so every request in the process goes through
        /// this gate regardless of how many users are browsing at once.
        /// </remarks>
        private static readonly SemaphoreSlim RequestGate = new(1, 1);
        private static DateTime _lastRequestUtc = DateTime.MinValue;
        private static readonly TimeSpan MinRequestInterval = TimeSpan.FromMilliseconds(600);

        /// <summary>
        /// Wikidata property ids for the external identifiers a Jellyfin item can carry.
        /// </summary>
        public const string PropImdb = "P345";
        public const string PropTmdbMovie = "P4947";
        public const string PropTmdbTv = "P4983";
        public const string PropTvdb = "P4835";

        /// <summary>
        /// The awards query, parameterised by identifier property and value.
        /// </summary>
        /// <remarks>
        /// Two shapes were measured and rejected before settling on this one:
        /// a variable predicate (VALUES ?idProp { wdt:P345 ... }) and a BIND(COALESCE(...))
        /// over the group variables both pushed the query past the service's 60s timeout.
        /// Selecting the raw optional variables and resolving the fallback chain in C#
        /// keeps the same query under ~1.3s on the heaviest titles measured.
        ///
        /// The Wikipedia sitelink is fetched for the AWARD only. The equivalent lookups
        /// for the ceremony and for each person were both measured past the service's
        /// 60s timeout, so those links are derived from their entity ids instead.
        /// </remarks>
        private const string QueryTemplate = @"SELECT ?kind ?award ?awardLabel ?year ?person ?personLabel ?ceremony ?ceremonyLabel ?series ?seriesLabel ?awardPart ?awardPartLabel ?awardArticle WHERE {
  ?work wdt:{PROP} ""{ID}"" .
  { ?work p:P166 ?st . ?st ps:P166 ?award . BIND(""win"" AS ?kind) }
  UNION { ?work p:P1411 ?st . ?st ps:P1411 ?award . BIND(""nom"" AS ?kind) }
  UNION { ?person p:P166 ?st . ?st ps:P166 ?award . ?st pq:P1686 ?work . BIND(""win"" AS ?kind) }
  UNION { ?person p:P1411 ?st . ?st ps:P1411 ?award . ?st pq:P1686 ?work . BIND(""nom"" AS ?kind) }
  OPTIONAL { ?st pq:P585 ?date . }
  OPTIONAL { ?st pq:P805 ?ceremony . OPTIONAL { ?ceremony wdt:P179 ?series . } }
  OPTIONAL { ?award wdt:P361 ?awardPart . }
  OPTIONAL { ?awardArticle schema:about ?award ; schema:isPartOf <https://en.wikipedia.org/> . }
  BIND(YEAR(?date) AS ?year)
  SERVICE wikibase:label { bd:serviceParam wikibase:language ""en"". }
}
LIMIT 500";

        public WikidataAwardsSource(IHttpClientFactory httpClientFactory, Logger logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        /// <summary>
        /// Queries Wikidata for one identifier and returns the deduplicated award list.
        /// </summary>
        /// <param name="property">One of the Prop* constants.</param>
        /// <param name="id">The identifier value, e.g. "tt0088763" or "105".</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>
        /// The award rows, or null when the request failed. An EMPTY list means the
        /// query succeeded and found nothing, which callers cache as a negative result;
        /// null means "unknown, try again later" and must not be cached as "no awards".
        /// </returns>
        public async Task<List<AwardEntry>?> GetAwardsAsync(string property, string id, CancellationToken cancellationToken)
        {
            if (!IsSafeIdentifier(id))
            {
                return null;
            }

            var query = QueryTemplate.Replace("{PROP}", property, StringComparison.Ordinal)
                                     .Replace("{ID}", id, StringComparison.Ordinal);

            string json;
            await RequestGate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                var sinceLast = DateTime.UtcNow - _lastRequestUtc;
                if (sinceLast < MinRequestInterval)
                {
                    await Task.Delay(MinRequestInterval - sinceLast, cancellationToken).ConfigureAwait(false);
                }

                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(30);

                var url = Endpoint + "?format=json&query=" + Uri.EscapeDataString(query);
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Accept.ParseAdd("application/sparql-results+json");

                // The service's usage policy requires a descriptive, contactable
                // user-agent; anonymous or generic clients are throttled or blocked.
                request.Headers.UserAgent.ParseAdd(
                    "Jellyfin-Enhanced-Awards/1.0 (+https://github.com/n00bcodr/Jellyfin-Enhanced)");

                using var response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
                _lastRequestUtc = DateTime.UtcNow;

                if (!response.IsSuccessStatusCode)
                {
                    _logger.Warning($"Awards: Wikidata query for {property}={id} returned {(int)response.StatusCode}.");
                    return null;
                }

                json = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            }
            // HttpClient.Timeout surfaces as a TaskCanceledException even when the
            // caller never cancelled, so the filter is what separates "the user went
            // away" from "this one query was slow". Without it a single slow query
            // would tear down the whole lookup — and, via the scheduled task, the
            // entire nightly refresh run.
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.Warning($"Awards: Wikidata query for {property}={id} failed: {ex.Message}");
                return null;
            }
            finally
            {
                RequestGate.Release();
            }

            try
            {
                return Collapse(ReadBindings(json));
            }
            catch (Exception ex)
            {
                _logger.Warning($"Awards: could not parse the Wikidata response for {property}={id}: {ex.Message}");
                return null;
            }
        }

        /// <summary>One raw SPARQL result row, before deduplication.</summary>
        private sealed class Row
        {
            public string Kind = string.Empty;
            public string Award = string.Empty;
            public string AwardLabel = string.Empty;
            public string? Person;
            public string? PersonLabel;
            public string? Ceremony;
            public string? CeremonyLabel;
            public string? SeriesLabel;
            public string? AwardPartLabel;
            public string? AwardArticle;
            public int? Year;
        }

        private static List<Row> ReadBindings(string json)
        {
            var rows = new List<Row>();
            using var doc = JsonDocument.Parse(json);

            if (!doc.RootElement.TryGetProperty("results", out var results)
                || !results.TryGetProperty("bindings", out var bindings)
                || bindings.ValueKind != JsonValueKind.Array)
            {
                return rows;
            }

            foreach (var binding in bindings.EnumerateArray())
            {
                var award = Value(binding, "award");
                var kind = Value(binding, "kind");
                if (string.IsNullOrEmpty(award) || string.IsNullOrEmpty(kind))
                {
                    continue;
                }

                int? year = null;
                var yearText = Value(binding, "year");
                if (!string.IsNullOrEmpty(yearText)
                    && int.TryParse(yearText, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedYear)
                    && parsedYear > 1800 && parsedYear < 2200)
                {
                    year = parsedYear;
                }

                rows.Add(new Row
                {
                    Kind = kind!,
                    Award = award!,
                    AwardLabel = Value(binding, "awardLabel") ?? string.Empty,
                    Person = Value(binding, "person"),
                    PersonLabel = Value(binding, "personLabel"),
                    Ceremony = Value(binding, "ceremony"),
                    CeremonyLabel = Value(binding, "ceremonyLabel"),
                    SeriesLabel = Value(binding, "seriesLabel"),
                    AwardPartLabel = Value(binding, "awardPartLabel"),
                    AwardArticle = Value(binding, "awardArticle"),
                    Year = year
                });
            }

            return rows;
        }

        private static string? Value(JsonElement binding, string name)
        {
            if (binding.TryGetProperty(name, out var node)
                && node.TryGetProperty("value", out var value)
                && value.ValueKind == JsonValueKind.String)
            {
                var text = value.GetString();
                return string.IsNullOrWhiteSpace(text) ? null : text;
            }

            return null;
        }

        /// <summary>
        /// Reduces raw statements to one entry per trophy.
        /// </summary>
        /// <remarks>
        /// Two kinds of duplication have to be removed or the counts inflate badly:
        ///
        /// 1. <b>Winners are usually recorded as nominees too.</b> Wikidata commonly carries
        ///    both P1411 (nominated for) and P166 (award received) for the same win, so a
        ///    win and a nomination collapse to a single win.
        /// 2. <b>The same trophy is recorded on the work AND on each credited person.</b>
        ///    Best Picture appears once on the film and once per producer; those are one
        ///    trophy shared by several people, not four separate awards.
        ///
        /// Keying on (award, year) rather than (award, ceremony) is deliberate: the same
        /// award frequently appears once with a ceremony qualifier and once with only a
        /// date, and a ceremony-keyed collapse leaves both behind as duplicates. Validated
        /// against known results — Oppenheimer resolves to 7 Academy Award wins and 6
        /// losing nominations (13 nominations in total), Parasite to 4 and 2, and The
        /// Shawshank Redemption to 0 and 7, each matching the real ceremony record.
        /// </remarks>
        private static List<AwardEntry> Collapse(List<Row> rows)
        {
            // Pass 1 — one record per (award, year, person); a win supersedes a nomination.
            var statements = new Dictionary<(string Award, string When, string Person), Row>();
            foreach (var row in rows)
            {
                var key = (row.Award, When(row), row.Person ?? string.Empty);
                if (!statements.TryGetValue(key, out var existing) || (existing.Kind == "nom" && row.Kind == "win"))
                {
                    statements[key] = row;
                }
            }

            // Pass 2 — one entry per (award, year); people credited on it are merged in.
            var trophies = new Dictionary<(string Award, string When), Row>();
            var people = new Dictionary<(string Award, string When), List<(string Kind, string Name)>>();

            foreach (var row in statements.Values)
            {
                var key = (row.Award, When(row));

                if (!trophies.TryGetValue(key, out var existing) || (existing.Kind == "nom" && row.Kind == "win"))
                {
                    trophies[key] = row;
                }

                if (!string.IsNullOrEmpty(row.PersonLabel))
                {
                    if (!people.TryGetValue(key, out var list))
                    {
                        list = new List<(string, string)>();
                        people[key] = list;
                    }

                    list.Add((row.Kind, row.PersonLabel!));
                }
            }

            var entries = new List<AwardEntry>();
            foreach (var pair in trophies)
            {
                var row = pair.Value;
                var isWinner = row.Kind == "win";

                // Only credit people whose own statement matches the trophy's outcome, so
                // a losing co-nominee is not listed under a win.
                var names = people.TryGetValue(pair.Key, out var candidates)
                    ? candidates.Where(p => (p.Kind == "win") == isWinner)
                                .Select(p => p.Name)
                                .Distinct(StringComparer.Ordinal)
                                .OrderBy(n => n, StringComparer.Ordinal)
                                .ToList()
                    : new List<string>();

                entries.Add(new AwardEntry
                {
                    IsWinner = isWinner,
                    Category = row.AwardLabel,
                    Group = DeriveGroup(row),
                    Ceremony = row.CeremonyLabel,
                    Year = row.Year,
                    People = names,
                    Url = row.AwardArticle ?? EntityPageUrl(row.Award)
                });
            }

            // Newest first, wins before nominations within a year, then alphabetical —
            // so the most recent and most notable rows are what the user sees first.
            return entries
                .OrderByDescending(e => e.Year ?? 0)
                .ThenByDescending(e => e.IsWinner)
                .ThenBy(e => e.Group, StringComparer.Ordinal)
                .ThenBy(e => e.Category, StringComparer.Ordinal)
                .ToList();
        }

        /// <summary>
        /// Turns a Wikidata entity URI into its human-readable page.
        /// </summary>
        /// <remarks>
        /// SPARQL returns entities as "http://www.wikidata.org/entity/Q123" — plain
        /// http, and the machine-readable form. The /wiki/ path over https is the page
        /// a person should actually land on, and avoids sending the user through a
        /// plaintext redirect.
        /// </remarks>
        private static string? EntityPageUrl(string? entityUri)
        {
            if (string.IsNullOrEmpty(entityUri))
            {
                return null;
            }

            const string Marker = "://www.wikidata.org/entity/";
            var index = entityUri!.IndexOf(Marker, StringComparison.Ordinal);
            if (index < 0)
            {
                return null;
            }

            var id = entityUri.Substring(index + Marker.Length);
            return Regex.IsMatch(id, @"\AQ\d+\z", RegexOptions.CultureInvariant)
                ? "https://www.wikidata.org/wiki/" + id
                : null;
        }

        /// <summary>
        /// The temporal component of a trophy key: the ceremony year when known,
        /// otherwise the ceremony URI, otherwise empty.
        /// </summary>
        private static string When(Row row)
        {
            if (row.Year.HasValue)
            {
                return row.Year.Value.ToString(CultureInfo.InvariantCulture);
            }

            return row.Ceremony ?? string.Empty;
        }

        /// <summary>
        /// Picks the award family used as a section heading.
        /// </summary>
        /// <remarks>
        /// Wikidata's own grouping properties are inconsistent — "Academy Award for Best
        /// Picture" has P361 (part of) but "Academy Award for Best Actor" does not — so the
        /// ceremony's series is preferred, then the award's parent, and finally the award
        /// name itself truncated at " for " ("Hugo Award for Best Dramatic Presentation"
        /// becomes "Hugo Award"). The last step is what keeps roughly a third of rows from
        /// landing in an anonymous bucket.
        /// </remarks>
        private static string DeriveGroup(Row row)
        {
            if (!string.IsNullOrWhiteSpace(row.SeriesLabel))
            {
                return row.SeriesLabel!;
            }

            if (!string.IsNullOrWhiteSpace(row.AwardPartLabel))
            {
                return row.AwardPartLabel!;
            }

            var label = row.AwardLabel;
            if (string.IsNullOrWhiteSpace(label))
            {
                return "Other";
            }

            var cut = label.IndexOf(" for ", StringComparison.OrdinalIgnoreCase);
            if (cut > 0)
            {
                return label.Substring(0, cut);
            }

            cut = label.IndexOf(" – ", StringComparison.Ordinal);
            return cut > 0 ? label.Substring(0, cut) : label;
        }

        /// <summary>
        /// Guards the identifier before it is interpolated into the SPARQL literal.
        /// </summary>
        /// <remarks>
        /// Provider ids come from library metadata that a user can edit, so the value is
        /// restricted to the alphanumeric shapes IMDb/TMDB/TVDB actually use. That leaves
        /// no quote or backslash able to escape the literal and alter the query.
        /// </remarks>
        public static bool IsSafeIdentifier(string? id)
        {
            return !string.IsNullOrEmpty(id)
                && id!.Length <= 24
                // \A and \z, not ^ and $: in .NET, $ also matches before a trailing
                // newline, so "105\n" would pass and reach the SPARQL literal.
                && Regex.IsMatch(id, @"\A[A-Za-z0-9]+\z", RegexOptions.CultureInvariant);
        }
    }
}
