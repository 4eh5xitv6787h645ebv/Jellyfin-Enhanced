using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Signature = Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrParentalSignature;
using Policy = Jellyfin.Plugin.JellyfinEnhanced.Services.SeerrParentalFilter.Policy;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrResponseReader;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrEndpointClassifier;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrParentalDecision;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr
{
    /// <summary>Filters list response shapes and nested knownFor titles under a shared bounded fetch pool.</summary>
    internal sealed class SeerrListFilter
    {
        // One server-wide fan-out pool (the owner is a singleton), shared by lists.
        // Single-title checks bypass this pool and still coalesce in the provider.
        private const int MaxConcurrentFetches = 16;
        internal static readonly TimeSpan OverallBudget = TimeSpan.FromSeconds(12);
        // Preserve literal <, > and & to match upstream JSON when rows are removed.
        private static readonly JsonSerializerOptions RelaxedJson = new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        private readonly SemaphoreSlim _throttle = new(MaxConcurrentFetches);
        private readonly SeerrSignatureProvider _signatures;
        private readonly Logger _logger;

        internal SeerrListFilter(SeerrSignatureProvider signatures, Logger logger)
        {
            _signatures = signatures;
            _logger = logger;
        }

        internal async Task<(string Body, bool RetryLater)> FilterListAsync(string json, EndpointPlan plan, Policy policy, string region, CancellationToken requestAborted)
        {
            if (JsonNode.Parse(json) is not JsonObject root)
            {
                return (json, false);
            }

            var arrays = CollectArrays(root, plan).ToList();
            if (arrays.Count == 0)
            {
                return (json, false);
            }

            var (scores, pending) = await ResolveScoresAsync(arrays, plan, region, policy.HasTagRules, requestAborted).ConfigureAwait(false);
            // A discover/search page whose titles could not all be verified in time
            // is not an empty page: the lookups keep running, so tell the caller to
            // have the client come back for it rather than rendering the gaps as
            // "nothing here" (the request list keeps its partial-page behaviour).
            // Person filmographies and collection parts are fetched whole and cached
            // by the client, so a partially-resolved one would stick as a complete
            // list. They get the same retry answer as a paged feed.
            var retryLater = pending > 0 && !plan.NestedMedia
                && plan.Container is Container.Results or Container.CombinedCredits or Container.Parts;

            var removed = 0;
            foreach (var array in arrays)
            {
                for (var i = array.Count - 1; i >= 0; i--)
                {
                    if (array[i] is not JsonObject row)
                    {
                        continue;
                    }

                    var item = ResolveItemObject(row, plan);
                    if (item == null)
                    {
                        continue; // nothing to evaluate (e.g. a request row without media) -> nothing to leak
                    }

                    if (!ShouldKeep(item, plan, policy, region, scores))
                    {
                        array.RemoveAt(i);
                        removed++;
                        continue;
                    }

                    // Person rows embed a `knownFor` list of titles that must be filtered too.
                    removed += FilterKnownFor(row, policy, region, scores);
                }
            }

            if (removed == 0)
            {
                return (json, retryLater); // nothing changed: hand back the upstream bytes untouched
            }

            _logger.Debug($"Parental filter removed {removed} item(s) from {plan.Container} response.");
            return (root.ToJsonString(RelaxedJson), retryLater);
        }

        private async Task<(Dictionary<string, Signature?> Scores, int Pending)> ResolveScoresAsync(
            IReadOnlyList<JsonArray> arrays,
            EndpointPlan plan,
            string region,
            bool needTags,
            CancellationToken requestAborted)
        {
            var keys = new Dictionary<string, (string MediaType, int TmdbId)>(StringComparer.Ordinal);
            foreach (var array in arrays)
            {
                foreach (var node in array)
                {
                    if (node is not JsonObject row)
                    {
                        continue;
                    }

                    var item = ResolveItemObject(row, plan);
                    if (item != null && !IsAdult(item))
                    {
                        var mediaType = ResolveMediaType(item, plan);
                        if (mediaType != null && TryGetTmdbId(item, plan.IdField, out var tmdbId))
                        {
                            keys[CacheKey(mediaType, tmdbId, region)] = (mediaType, tmdbId);
                        }
                    }

                    if (row["knownFor"] is JsonArray knownFor)
                    {
                        foreach (var kf in knownFor)
                        {
                            if (kf is not JsonObject entry || IsAdult(entry))
                            {
                                continue;
                            }

                            var kfType = NormalizeMediaType(ReadString(entry, "mediaType"));
                            if (kfType != null && TryGetTmdbId(entry, "id", out var kfId))
                            {
                                keys[CacheKey(kfType, kfId, region)] = (kfType, kfId);
                            }
                        }
                    }
                }
            }

            var scores = new Dictionary<string, Signature?>(StringComparer.Ordinal);
            if (keys.Count == 0)
            {
                return (scores, 0);
            }

            // Budget for this response; also stops waiting when the browser aborts
            // the request (superseded typeahead search). Fetches already holding a
            // slot are NOT cancelled by the budget: they finish and warm the cache.
            // Rows still QUEUED for a slot when the caller gives up are dropped:
            // the pool is shared by every request, and letting each abandoned page
            // keep its 20-100 queued lookups meant a user browsing several pages
            // pushed the page they are looking at behind everything they had left,
            // until nothing resolved within the budget at all.
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
            cts.CancelAfter(OverallBudget);
            var throttle = _throttle;
            var droppedFromQueue = 0;

            var tasks = keys.Select(async kvp =>
            {
                // Cache hits never occupy a slot.
                if (_signatures.TryGetFreshSignature(kvp.Key, needTags, out var hit))
                {
                    return (kvp.Key, hit);
                }

                // A superseded request (typeahead) doesn't need cache warming.
                if (requestAborted.IsCancellationRequested)
                {
                    return (kvp.Key, (Signature?)null);
                }

                try
                {
                    await throttle.WaitAsync(cts.Token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    Interlocked.Increment(ref droppedFromQueue);
                    return (kvp.Key, (Signature?)null); // never got a slot: unverified, not cached as anything
                }

                try
                {
                    var score = await _signatures.GetSignatureAsync(kvp.Value.MediaType, kvp.Value.TmdbId, region, needTags, CancellationToken.None).ConfigureAwait(false);
                    return (kvp.Key, score);
                }
                finally
                {
                    throttle.Release();
                }
            }).ToList();

            var whenAll = Task.WhenAll(tasks);
            // The element tasks never throw today; observe a fault anyway so an
            // abandoned WhenAll can never surface as an unobserved task exception.
            _ = whenAll.ContinueWith(t => _ = t.Exception, TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously);
            try
            {
                await whenAll.WaitAsync(cts.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (!requestAborted.IsCancellationRequested)
            {
                // Over budget: keep what finished, hide the rest (fail closed); the
                // in-flight tasks continue and populate the cache, the queued ones
                // have been dropped.
            }

            // Counted after the wait rather than only in the catch: when the budget
            // fires, the queued waiters complete (as dropped) before WhenAll sees the
            // cancellation, so WhenAll can finish normally with rows never looked up.
            var pending = tasks.Count(t => !t.IsCompletedSuccessfully) + droppedFromQueue;
            if (pending > 0)
            {
                _logger.Debug($"Parental filter: {pending} of {tasks.Count} title lookups unresolved after {OverallBudget.TotalSeconds:0}s ({droppedFromQueue} never started); hiding them for this response.");
            }

            foreach (var task in tasks)
            {
                if (task.IsCompletedSuccessfully)
                {
                    var (key, score) = task.Result;
                    scores[key] = score;
                }
            }

            requestAborted.ThrowIfCancellationRequested();
            return (scores, pending);
        }

        private bool ShouldKeep(
            JsonObject item,
            EndpointPlan plan,
            Policy policy,
            string region,
            IReadOnlyDictionary<string, Signature?> scores)
        {
            var mediaType = ResolveMediaType(item, plan);
            if (mediaType == null)
            {
                // Persons and collections carry no rating of their own (a person's
                // knownFor titles are filtered below, a collection's parts when it is
                // opened). Anything else without a recognised media type cannot be
                // verified and fails closed like every other unverifiable row.
                var raw = ReadString(item, "mediaType")?.ToLowerInvariant();
                return raw is "person" or "collection";
            }

            if (IsAdult(item))
            {
                return false;
            }

            if (!TryGetTmdbId(item, plan.IdField, out var tmdbId))
            {
                return false; // unidentifiable movie/tv row cannot be verified
            }

            scores.TryGetValue(CacheKey(mediaType, tmdbId, region), out var score);
            return IsAllowed(score, mediaType, policy);
        }

        private int FilterKnownFor(
            JsonObject row,
            Policy policy,
            string region,
            IReadOnlyDictionary<string, Signature?> scores)
        {
            if (row["knownFor"] is not JsonArray knownFor)
            {
                return 0;
            }

            var removed = 0;
            for (var j = knownFor.Count - 1; j >= 0; j--)
            {
                if (knownFor[j] is not JsonObject entry)
                {
                    continue;
                }

                // knownFor holds titles only; one without a recognised media type
                // cannot be verified and is dropped like any other unverifiable row.
                var mediaType = NormalizeMediaType(ReadString(entry, "mediaType"));
                if (mediaType == null || IsAdult(entry) || !TryGetTmdbId(entry, "id", out var tmdbId))
                {
                    knownFor.RemoveAt(j);
                    removed++;
                    continue;
                }

                scores.TryGetValue(CacheKey(mediaType, tmdbId, region), out var score);
                if (!IsAllowed(score, mediaType, policy))
                {
                    knownFor.RemoveAt(j);
                    removed++;
                }
            }

            return removed;
        }

    }
}
