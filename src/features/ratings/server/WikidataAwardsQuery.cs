using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>SPARQL query and result mapping for title and person awards.</summary>
    internal static class WikidataAwardsQuery
    {
        /// <summary>
        /// Wins/nominations directly on the film/show entity (Best Picture-type
        /// categories) UNION wins/nominations held by a person but qualified
        /// "for work" (P1686) back to this exact title (acting/directing/writing
        /// categories, which Wikidata records on the person, not the film).
        /// Flattened as four UNION branches (not nested) — a nested
        /// OPTIONAL-inside-UNION version of this query was observed to time out
        /// against the live endpoint; this shape reliably returns in under 2s
        /// even for award-heavy titles.
        /// </summary>
        internal static string BuildTitleQuery(string mediaType, string tmdbId)
        {
            var prop = mediaType == "tv" ? "P4983" : "P4947";
            var escapedId = tmdbId.Replace("\\", "\\\\").Replace("\"", "\\\"");

            return $@"
SELECT ?award ?awardLabel ?result ?year ?personLabel WHERE {{
  {{
    ?film wdt:{prop} ""{escapedId}"" .
    ?film p:P166 ?st1 . ?st1 ps:P166 ?award .
    OPTIONAL {{ ?st1 pq:P585 ?d1 . BIND(YEAR(?d1) AS ?year) }}
    BIND(""Won"" AS ?result)
  }}
  UNION
  {{
    ?film wdt:{prop} ""{escapedId}"" .
    ?film p:P1411 ?st2 . ?st2 ps:P1411 ?award .
    OPTIONAL {{ ?st2 pq:P585 ?d2 . BIND(YEAR(?d2) AS ?year) }}
    BIND(""Nominated"" AS ?result)
  }}
  UNION
  {{
    ?film wdt:{prop} ""{escapedId}"" .
    ?person p:P166 ?st3 . ?st3 ps:P166 ?award ; pq:P1686 ?film .
    OPTIONAL {{ ?st3 pq:P585 ?d3 . BIND(YEAR(?d3) AS ?year) }}
    BIND(""Won"" AS ?result)
  }}
  UNION
  {{
    ?film wdt:{prop} ""{escapedId}"" .
    ?person p:P1411 ?st4 . ?st4 ps:P1411 ?award ; pq:P1686 ?film .
    OPTIONAL {{ ?st4 pq:P585 ?d4 . BIND(YEAR(?d4) AS ?year) }}
    BIND(""Nominated"" AS ?result)
  }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language ""en,mul"". }}
}}";
        }

        /// <summary>
        /// A person's own award claims (won/nominated), with the "for work"
        /// qualifier (P1686) resolved to a label when present — competitive
        /// craft awards (acting/directing/writing) are almost always awarded
        /// "for" a specific film/show; honorary/civic recognitions (honorary
        /// degrees, guild fellowships, walk-of-fame stars, national honours)
        /// have no such qualifier and come through with an empty work. Unlike
        /// the title query this doesn't need to look outward to any other
        /// entity, so it's a plain 2-way union instead of 4.
        /// </summary>
        internal static string BuildPersonQuery(string tmdbId)
        {
            var escapedId = tmdbId.Replace("\\", "\\\\").Replace("\"", "\\\"");

            return $@"
SELECT ?award ?awardLabel ?result ?year ?workLabel WHERE {{
  {{
    ?person wdt:P4985 ""{escapedId}"" .
    ?person p:P166 ?st1 . ?st1 ps:P166 ?award .
    OPTIONAL {{ ?st1 pq:P585 ?d1 . BIND(YEAR(?d1) AS ?year) }}
    OPTIONAL {{ ?st1 pq:P1686 ?work . }}
    BIND(""Won"" AS ?result)
  }}
  UNION
  {{
    ?person wdt:P4985 ""{escapedId}"" .
    ?person p:P1411 ?st2 . ?st2 ps:P1411 ?award .
    OPTIONAL {{ ?st2 pq:P585 ?d2 . BIND(YEAR(?d2) AS ?year) }}
    OPTIONAL {{ ?st2 pq:P1686 ?work . }}
    BIND(""Nominated"" AS ?result)
  }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language ""en,mul"". }}
}}";
        }

        /// <summary>
        /// Groups raw SPARQL rows into one AwardEntry per (award, result, year).
        /// For a title lookup this collapses a category held by several people
        /// (e.g. Best Picture producers) into one entry listing every recipient
        /// (isPerson: false, reads "personLabel" into Recipients). For a person
        /// lookup it instead collects which film/show each row was "for" into
        /// Works (isPerson: true, reads "workLabel") — rows with neither (the
        /// direct-film-entity branches on the title side, or a person's
        /// non-competitive honors with no qualifying work) simply add nothing
        /// beyond the bare award/result/year.
        /// </summary>
        internal static AwardsCacheEntry ParseResults(JsonDocument doc, long fetchedAtUnixMs, bool isPerson)
        {
            var bindings = doc.RootElement.GetProperty("results").GetProperty("bindings");
            var detailProperty = isPerson ? "workLabel" : "personLabel";

            var groups = new Dictionary<(string Name, string Result, int? Year), AwardEntry>();
            foreach (var row in bindings.EnumerateArray())
            {
                var name = GetLiteral(row, "awardLabel");
                var result = GetLiteral(row, "result");
                if (name == null || result == null) continue;
                // Wikidata's label service falls back to printing the raw entity id
                // (e.g. "Q3379934") when no label exists in any requested language —
                // "en,mul" (see BuildTitleQuery/BuildPersonQuery) covers most cases,
                // but not every entity has even that. An award with no real name
                // isn't useful to show at all.
                if (IsWikidataQid(name)) continue;

                int? year = null;
                if (row.TryGetProperty("year", out var yearEl) && yearEl.TryGetProperty("value", out var yearVal)
                    && int.TryParse(yearVal.GetString(), out var parsedYear))
                {
                    year = parsedYear;
                }

                var groupKey = (name, result, year);
                if (!groups.TryGetValue(groupKey, out var entry))
                {
                    entry = new AwardEntry { Name = name, Result = result, Year = year };
                    groups[groupKey] = entry;
                }

                var detail = GetLiteral(row, detailProperty);
                if (string.IsNullOrEmpty(detail) || IsWikidataQid(detail)) continue;

                var targetList = isPerson ? entry.Works : entry.Recipients;
                if (!targetList.Contains(detail))
                {
                    targetList.Add(detail);
                }
            }

            // Wikidata sometimes carries both a "nominated for" and an "award
            // received" statement for the exact same category/year (a real, if
            // slightly redundant, data quirk — not a query bug) — that would
            // otherwise show the same award listed twice and double-count it in
            // Wins+Nominations. Winning subsumes being nominated, so drop the
            // redundant "Nominated" sibling wherever a "Won" exists for the same
            // (Name, Year), folding in any recipients/works only the dropped
            // entry had (defensive — normally identical, but never silently
            // lose data if they ever differ).
            var wonKeys = new HashSet<(string Name, int? Year)>(
                groups.Values.Where(a => a.Result == "Won").Select(a => (a.Name, a.Year)));

            foreach (var award in groups.Values.Where(a => a.Result == "Nominated" && wonKeys.Contains((a.Name, a.Year))))
            {
                if (groups.TryGetValue((award.Name, "Won", award.Year), out var wonEntry))
                {
                    foreach (var r in award.Recipients) if (!wonEntry.Recipients.Contains(r)) wonEntry.Recipients.Add(r);
                    foreach (var w in award.Works) if (!wonEntry.Works.Contains(w)) wonEntry.Works.Add(w);
                }
            }

            var awards = groups.Values
                .Where(a => !(a.Result == "Nominated" && wonKeys.Contains((a.Name, a.Year))))
                .OrderByDescending(a => a.Year ?? 0)
                .ThenBy(a => a.Result == "Won" ? 0 : 1) // wins before nominations within the same year
                .ToList();

            return new AwardsCacheEntry
            {
                Found = awards.Count > 0,
                Confirmed = true, // Wikidata answered successfully, whether or not it had rows
                Wins = awards.Count(a => a.Result == "Won"),
                Nominations = awards.Count(a => a.Result == "Nominated"),
                Awards = awards,
                FetchedAtUnixMs = fetchedAtUnixMs,
            };
        }

        private static string? GetLiteral(JsonElement row, string property) =>
            row.TryGetProperty(property, out var el) && el.TryGetProperty("value", out var val) ? val.GetString() : null;

        private static readonly Regex WikidataQidPattern = new(@"^Q\d+$", RegexOptions.Compiled);

        /// <summary>True for a bare Wikidata entity id ("Q3379934") — what the
        /// label service prints when an entity has no label in any requested
        /// language, instead of a real display name.</summary>
        private static bool IsWikidataQid(string value) => WikidataQidPattern.IsMatch(value);

    }
}
