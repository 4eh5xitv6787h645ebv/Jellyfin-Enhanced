using System;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Model.Awards;
using MediaBrowser.Common.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Produces headline award counts from OMDb's flat "Awards" summary string.
    /// </summary>
    /// <remarks>
    /// Two acquisition paths, cheapest first:
    ///
    /// 1. <b>Jellyfin's own OMDb cache.</b> Jellyfin core's OMDb metadata provider
    ///    (MediaBrowser.Providers/Plugins/Omdb) is enabled by default and writes the
    ///    complete OMDb JSON — including the "Awards" field, which Jellyfin itself
    ///    never uses — to {CachePath}/omdb/{imdbId}.json. Reading that file costs no
    ///    network request and needs no API key, so most of a library resolves for free.
    ///
    /// 2. <b>A direct OMDb request</b> using an API key the admin supplied, for items
    ///    Jellyfin has not cached. Optional; skipped when no key is configured.
    ///
    /// Jellyfin's shared built-in OMDb key is deliberately NOT reused for path 2: it is
    /// a single free 1,000/day key shared by every Jellyfin install, and minting new
    /// requests against it would both fail constantly and burden every other user.
    /// Reading files Jellyfin already fetched on its own behalf carries no such cost.
    /// </remarks>
    public class OmdbAwardsSource
    {
        private readonly IApplicationPaths _applicationPaths;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;

        public const string SourceCache = "omdb-cache";
        public const string SourceApi = "omdb-api";

        /// <summary>
        /// Matches the optional headline-award clause, e.g. "Won 4 Oscars. " or
        /// "Nominated for 2 BAFTA " — note the award vocabulary is a CLOSED whitelist.
        /// </summary>
        /// <remarks>
        /// The whitelist is not stylistic. OMDb emits BAFTA leads with no separator at
        /// all and sometimes drops the noun ("Nominated for 2 BAFTA 17 wins &amp; 50
        /// nominations total", "Won 1 BAFTA Award13 wins &amp; 43 nominations total").
        /// An open-ended award pattern greedily eats into the digits of the totals
        /// clause on those strings and silently reports wrong numbers; a closed
        /// alternation stops exactly at the award name. "Primetime Emmy" must precede
        /// the bare "Emmy" alternative or the longer form never matches.
        /// </remarks>
        private static readonly Regex LeadRegex = new(
            @"^\s*(?<verb>Won|Nominated\s+for)\s+(?<count>\d{1,4})\s+" +
            @"(?<award>Oscars?|Primetime\s+Emmys?|Emmys?|Golden\s+Globes?|BAFTA(?:\s+Film|\s+TV)?(?:\s+Awards?)?)" +
            @"\s*[.\-–]?\s*",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

        /// <summary>
        /// Matches the optional totals clause: "27 wins &amp; 25 nominations total",
        /// "5 wins total", "1 nomination total", or the legacy "Another 3 wins &amp; 2 nominations.".
        /// </summary>
        private static readonly Regex TotalsRegex = new(
            @"^\s*(?<another>Another\s+)?" +
            @"(?:(?<wins>\d{1,5})\s+wins?)?" +
            @"(?:\s*&\s*)?" +
            @"(?:(?<noms>\d{1,5})\s+nominations?)?" +
            @"(?:\s+total)?\s*\.?\s*$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

        public OmdbAwardsSource(IApplicationPaths applicationPaths, IHttpClientFactory httpClientFactory, Logger logger)
        {
            _applicationPaths = applicationPaths;
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        /// <summary>
        /// Resolves the awards summary for an IMDb id, preferring Jellyfin's on-disk
        /// OMDb cache and falling back to a direct request only when an API key is set.
        /// </summary>
        /// <param name="imdbId">IMDb id including the "tt" prefix.</param>
        /// <param name="apiKey">Admin-supplied OMDb key, or null/empty to skip the network path.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>
        /// A summary when counts were found; null when neither path produced data.
        /// A summary with Wins == 0 and Nominations == 0 means OMDb has a record for
        /// the title and it genuinely has no awards.
        /// </returns>
        public async Task<AwardsSummary?> GetSummaryAsync(string imdbId, string? apiKey, CancellationToken cancellationToken)
        {
            if (!IsValidImdbId(imdbId))
            {
                return null;
            }

            var fromCache = ReadFromJellyfinCache(imdbId);
            if (fromCache != null)
            {
                return fromCache;
            }

            if (string.IsNullOrWhiteSpace(apiKey))
            {
                return null;
            }

            return await FetchFromApiAsync(imdbId, apiKey!, cancellationToken).ConfigureAwait(false);
        }

        /// <summary>
        /// Reads {CachePath}/omdb/{imdbId}.json if Jellyfin has already cached it.
        /// </summary>
        /// <remarks>
        /// This is an internal implementation detail of Jellyfin core, not public API,
        /// so every failure mode (missing directory, truncated file, changed shape,
        /// an unmatched-title stub with Response:"False") degrades to null rather than
        /// throwing. Jellyfin's JsonOmdbNotAvailableStringConverter also rewrites OMDb's
        /// literal "N/A" to null on the way in, so both spellings must be treated as
        /// "no awards data".
        /// </remarks>
        private AwardsSummary? ReadFromJellyfinCache(string imdbId)
        {
            try
            {
                var path = Path.Combine(_applicationPaths.CachePath, "omdb", imdbId + ".json");
                if (!File.Exists(path))
                {
                    return null;
                }

                using var stream = File.OpenRead(path);
                using var doc = JsonDocument.Parse(stream);

                if (doc.RootElement.ValueKind != JsonValueKind.Object)
                {
                    return null;
                }

                // Unmatched ids are cached as {"Response":"False", "Error":"..."} with
                // no Awards member at all. That is not a parse failure, just an absence.
                if (!doc.RootElement.TryGetProperty("Awards", out var awardsElement)
                    || awardsElement.ValueKind != JsonValueKind.String)
                {
                    return null;
                }

                var summary = Parse(awardsElement.GetString());
                if (summary != null)
                {
                    summary.Source = SourceCache;
                }

                return summary;
            }
            catch (Exception ex)
            {
                _logger.Debug($"Awards: could not read Jellyfin's OMDb cache for {imdbId}: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Requests a single title from OMDb with the admin's own API key.
        /// </summary>
        private async Task<AwardsSummary?> FetchFromApiAsync(string imdbId, string apiKey, CancellationToken cancellationToken)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(15);

                var url = string.Format(
                    CultureInfo.InvariantCulture,
                    "https://www.omdbapi.com/?i={0}&plot=short&r=json&apikey={1}",
                    Uri.EscapeDataString(imdbId),
                    Uri.EscapeDataString(apiKey));

                using var response = await client.GetAsync(url, cancellationToken).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.Warning($"Awards: OMDb request for {imdbId} returned {(int)response.StatusCode}.");
                    return null;
                }

                var json = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                using var doc = JsonDocument.Parse(json);

                // OMDb signals both "bad key" and "title not found" with Response:"False".
                if (doc.RootElement.TryGetProperty("Response", out var responseFlag)
                    && responseFlag.ValueKind == JsonValueKind.String
                    && !string.Equals(responseFlag.GetString(), "True", StringComparison.OrdinalIgnoreCase))
                {
                    var error = doc.RootElement.TryGetProperty("Error", out var e) ? e.GetString() : "unknown";
                    _logger.Debug($"Awards: OMDb returned no data for {imdbId} ({error}).");
                    return null;
                }

                if (!doc.RootElement.TryGetProperty("Awards", out var awardsElement)
                    || awardsElement.ValueKind != JsonValueKind.String)
                {
                    return null;
                }

                var summary = Parse(awardsElement.GetString());
                if (summary != null)
                {
                    summary.Source = SourceApi;
                }

                return summary;
            }
            // Only a genuine caller cancellation propagates; an HttpClient timeout
            // arrives as the same exception type and is handled as a failed lookup.
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.Warning($"Awards: OMDb request for {imdbId} failed: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Parses an OMDb "Awards" string into structured counts.
        /// </summary>
        /// <param name="text">The raw OMDb value, which may be null or "N/A".</param>
        /// <returns>
        /// Parsed counts, or null when the string carries no usable information.
        /// An all-zero summary is returned for a string that parsed but described no
        /// awards, so callers can cache that as a definitive "nothing to show".
        /// </returns>
        /// <remarks>
        /// Two totals dialects exist and they differ in whether the lead award is
        /// already counted:
        ///   modern:  "Won 1 Oscar. 27 wins &amp; 25 nominations total" — the 27 INCLUDES the Oscar.
        ///   legacy:  "Won 1 Oscar. Another 26 wins &amp; 25 nominations." — the 26 EXCLUDES it.
        /// Only the legacy "Another" form is added to the lead count; adding both would
        /// double-count the headline award on every modern string.
        /// </remarks>
        public static AwardsSummary? Parse(string? text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                return null;
            }

            var raw = text!.Trim();
            if (string.Equals(raw, "N/A", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var summary = new AwardsSummary { RawText = raw };
            var remainder = raw;

            var lead = LeadRegex.Match(remainder);
            if (lead.Success)
            {
                summary.LeadVerb = lead.Groups["verb"].Value.StartsWith("Won", StringComparison.OrdinalIgnoreCase)
                    ? "Won"
                    : "NominatedFor";
                summary.LeadCount = ParseInt(lead.Groups["count"].Value);
                summary.LeadAward = NormalizeWhitespace(lead.Groups["award"].Value);
                remainder = remainder.Substring(lead.Length);
            }

            var totals = TotalsRegex.Match(remainder);
            var matchedTotals = totals.Success && (totals.Groups["wins"].Success || totals.Groups["noms"].Success);

            if (matchedTotals)
            {
                summary.Wins = totals.Groups["wins"].Success ? ParseInt(totals.Groups["wins"].Value) : 0;
                summary.Nominations = totals.Groups["noms"].Success ? ParseInt(totals.Groups["noms"].Value) : 0;

                if (totals.Groups["another"].Success && lead.Success)
                {
                    // Legacy dialect: the totals exclude the headline award, so fold it in.
                    if (summary.LeadVerb == "Won")
                    {
                        summary.Wins += summary.LeadCount;
                    }
                    else
                    {
                        summary.Nominations += summary.LeadCount;
                    }
                }
            }
            else if (lead.Success)
            {
                // A lead award with no totals clause at all, e.g. "Nominated for 3 Oscars."
                if (summary.LeadVerb == "Won")
                {
                    summary.Wins = summary.LeadCount;
                }
                else
                {
                    summary.Nominations = summary.LeadCount;
                }
            }
            else
            {
                // Neither clause matched: an unrecognised dialect. Returning null keeps
                // an unparsed string from being presented as a confident "0 wins".
                return null;
            }

            return summary;
        }

        /// <summary>Rejects anything that is not a well-formed IMDb title id.</summary>
        /// <remarks>
        /// The id is interpolated into a file path and a URL, so it is validated at the
        /// boundary rather than trusted from provider metadata.
        /// </remarks>
        public static bool IsValidImdbId(string? id)
        {
            return !string.IsNullOrEmpty(id)
                // \A and \z, not ^ and $: $ also matches before a trailing newline,
                // which would let "tt0088763\n" through into a file path.
                && Regex.IsMatch(id, @"\Att\d{6,12}\z", RegexOptions.CultureInvariant);
        }

        private static int ParseInt(string value)
        {
            return int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0;
        }

        private static string NormalizeWhitespace(string value)
        {
            return Regex.Replace(value.Trim(), @"\s+", " ");
        }
    }
}
