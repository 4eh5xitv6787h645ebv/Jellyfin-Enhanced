using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyfinEnhanced.ScheduledTasks
{
    /// Scheduled task that syncs tags from Radarr and Sonarr to Jellyfin items.
    public class ArrTagsSyncTask : IScheduledTask
    {
        private readonly ILibraryManager _libraryManager;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;

        public ArrTagsSyncTask(
            ILibraryManager libraryManager,
            IHttpClientFactory httpClientFactory,
            Logger logger)
        {
            _libraryManager = libraryManager;
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        public string Name => "Sync Tags from *arr to Jellyfin";

        public string Key => "JellyfinEnhancedArrTagsSync";

        public string Description => "Fetches tags from Radarr and Sonarr and adds them to Jellyfin items as metadata tags. \n\n Configure the task triggers to run this task periodically for new items to be synced automatically.";

        public string Category => "Jellyfin Enhanced";

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            return Array.Empty<TaskTriggerInfo>();
        }

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;

            if (config == null || !config.ArrTagsSyncEnabled)
            {
                _logger.Info("Arr Tags Sync is disabled in plugin configuration.");
                progress?.Report(100);
                return;
            }

            _logger.Info("Starting Arr Tags Sync task...");
            progress?.Report(0);

            var radarrService = new RadarrService(_httpClientFactory, _logger);
            var sonarrService = new SonarrService(_httpClientFactory, _logger);

            var radarrTags = new Dictionary<int, List<string>>();
            var sonarrTags = new Dictionary<string, List<string>>();

            // Track per-side fetch failures. When any enabled instance on a given side failed,
            // we MUST NOT run the destructive "clear old tags" pass for that side — an empty
            // dict from a failed fetch is indistinguishable from "instance genuinely empty",
            // and clearing would wipe tags library-wide on a transient outage.
            var radarrHadFailures = false;
            var sonarrHadFailures = false;

            if (config.IsRadarrInstancesCorrupt())
            {
                _logger.Error("RadarrInstances config is corrupt JSON — no Radarr tags will sync this run. "
                    + "Admin must open the Arr Links config page and reset the corrupt value.");
                radarrHadFailures = true;
            }
            var radarrInstances = config.GetEnabledRadarrInstances();
            var failedRadarrInstances = new List<string>();
            if (radarrInstances.Count > 0)
            {
                foreach (var instance in radarrInstances)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    try
                    {
                        _logger.Info($"Fetching tags from Radarr instance: {instance.Name}");
                        var instanceTags = await radarrService.GetMovieTagsByTmdbId(instance.Url, instance.ApiKey, cancellationToken);
                        _logger.Info($"Fetched {instanceTags.Count} movie tag mappings from {instance.Name}");
                        foreach (var kvp in instanceTags)
                        {
                            if (radarrTags.TryGetValue(kvp.Key, out var existing))
                            {
                                foreach (var tag in kvp.Value)
                                {
                                    if (!existing.Contains(tag, StringComparer.OrdinalIgnoreCase))
                                        existing.Add(tag);
                                }
                            }
                            else
                            {
                                radarrTags[kvp.Key] = new List<string>(kvp.Value);
                            }
                        }
                    }
                    catch (OperationCanceledException) { throw; }
                    catch (ArrFetchFailedException ex)
                    {
                        failedRadarrInstances.Add(instance.Name);
                        radarrHadFailures = true;
                        _logger.Error($"Failed to sync tags from Radarr instance {instance.Name}: {ex.Message}");
                    }
                    catch (Exception ex)
                    {
                        failedRadarrInstances.Add(instance.Name);
                        radarrHadFailures = true;
                        _logger.Error(ex, $"Unexpected error syncing tags from Radarr instance {instance.Name}");
                    }
                }
            }
            else
            {
                var allRadarr = config.GetRadarrInstances();
                if (allRadarr.Count > 0)
                    _logger.Info($"All {allRadarr.Count} Radarr instances are disabled — skipping Radarr sync");
                else
                    _logger.Info("No Radarr instances configured, skipping Radarr sync");
            }

            progress?.Report(25);
            cancellationToken.ThrowIfCancellationRequested();

            if (config.IsSonarrInstancesCorrupt())
            {
                _logger.Error("SonarrInstances config is corrupt JSON — no Sonarr tags will sync this run. "
                    + "Admin must open the Arr Links config page and reset the corrupt value.");
                sonarrHadFailures = true;
            }
            var sonarrInstances = config.GetEnabledSonarrInstances();
            var failedSonarrInstances = new List<string>();
            if (sonarrInstances.Count > 0)
            {
                foreach (var instance in sonarrInstances)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    try
                    {
                        _logger.Info($"Fetching tags from Sonarr instance: {instance.Name}");
                        var instanceTags = await sonarrService.GetSeriesTagsByTvdbId(instance.Url, instance.ApiKey, cancellationToken);
                        _logger.Info($"Fetched {instanceTags.Count} series tag mappings from {instance.Name}");
                        foreach (var kvp in instanceTags)
                        {
                            if (sonarrTags.TryGetValue(kvp.Key, out var existing))
                            {
                                foreach (var tag in kvp.Value)
                                {
                                    if (!existing.Contains(tag, StringComparer.OrdinalIgnoreCase))
                                        existing.Add(tag);
                                }
                            }
                            else
                            {
                                sonarrTags[kvp.Key] = new List<string>(kvp.Value);
                            }
                        }
                    }
                    catch (OperationCanceledException) { throw; }
                    catch (ArrFetchFailedException ex)
                    {
                        failedSonarrInstances.Add(instance.Name);
                        sonarrHadFailures = true;
                        _logger.Error($"Failed to sync tags from Sonarr instance {instance.Name}: {ex.Message}");
                    }
                    catch (Exception ex)
                    {
                        failedSonarrInstances.Add(instance.Name);
                        sonarrHadFailures = true;
                        _logger.Error(ex, $"Unexpected error syncing tags from Sonarr instance {instance.Name}");
                    }
                }
            }
            else
            {
                var allSonarr = config.GetSonarrInstances();
                if (allSonarr.Count > 0)
                    _logger.Info($"All {allSonarr.Count} Sonarr instances are disabled — skipping Sonarr sync");
                else
                    _logger.Info("No Sonarr instances configured, skipping Sonarr sync");
            }

            progress?.Report(50);
            cancellationToken.ThrowIfCancellationRequested();

            var allItems = _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                IsVirtualItem = false,
                Recursive = true
            }).ToList();

            _logger.Info($"Found {allItems.Count} items in Jellyfin library");

            var updatedCount = 0;
            var totalItems = allItems.Count;
            var processedItems = 0;
            var updatedItemNames = new List<string>();

            string tagPrefix = config.ArrTagsPrefix ?? "Requested by: ";
            bool clearOldTags = config.ArrTagsClearOldTags;

            // Guard the destructive path. If any instance on the side being synced failed, we
            // cannot distinguish "zero tagged items" from "fetch failed" — skip clearing for
            // that side so a transient outage doesn't wipe tags library-wide.
            bool clearRadarrTags = clearOldTags && !radarrHadFailures;
            bool clearSonarrTags = clearOldTags && !sonarrHadFailures;

            if (clearOldTags && (radarrHadFailures || sonarrHadFailures))
            {
                var affected = new List<string>();
                if (radarrHadFailures) affected.Add("Radarr (movies)");
                if (sonarrHadFailures) affected.Add("Sonarr (series)");
                _logger.Warning($"clearOldTags is enabled but {string.Join(" and ", affected)} had failures this run — "
                    + $"skipping the clear-old-tags pass for those sides to avoid wiping tags on a transient outage. "
                    + $"Failed instances: Radarr=[{string.Join(", ", failedRadarrInstances)}] "
                    + $"Sonarr=[{string.Join(", ", failedSonarrInstances)}].");
            }

            var syncFilterTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(config.ArrTagsSyncFilter))
            {
                var filterParts = config.ArrTagsSyncFilter.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var part in filterParts)
                {
                    syncFilterTags.Add(part.Trim());
                }
                _logger.Info($"Filtering tags to sync: {string.Join(", ", syncFilterTags)}");
            }

            foreach (var item in allItems)
            {
                cancellationToken.ThrowIfCancellationRequested();

                List<string>? tagsToAdd = null;
                bool isMovie = item is Movie;
                bool isSeries = item is Series;

                if (item is Movie movie)
                {
                    var tmdbId = movie.GetProviderId(MediaBrowser.Model.Entities.MetadataProvider.Tmdb);
                    if (!string.IsNullOrWhiteSpace(tmdbId) && int.TryParse(tmdbId, out var tmdbIdInt))
                    {
                        if (radarrTags.TryGetValue(tmdbIdInt, out var tags))
                        {
                            tagsToAdd = tags;
                        }
                    }
                }
                else if (item is Series series)
                {
                    var imdbId = series.GetProviderId(MediaBrowser.Model.Entities.MetadataProvider.Imdb);
                    if (!string.IsNullOrWhiteSpace(imdbId))
                    {
                        if (sonarrTags.TryGetValue(imdbId, out var tags))
                        {
                            tagsToAdd = tags;
                        }
                    }
                }

                var existingTags = item.Tags?.ToList() ?? new List<string>();
                var modified = false;

                // Only clear for the side that had no failures. Movies → Radarr, Series → Sonarr.
                bool shouldClearThisItem = (isMovie && clearRadarrTags) || (isSeries && clearSonarrTags);
                if (shouldClearThisItem)
                {
                    var tagsToRemove = existingTags
                        .Where(t => t.StartsWith(tagPrefix, StringComparison.OrdinalIgnoreCase))
                        .ToList();

                    if (tagsToRemove.Count > 0)
                    {
                        foreach (var tag in tagsToRemove)
                        {
                            existingTags.Remove(tag);
                        }
                        modified = true;
                    }
                }

                if (tagsToAdd != null && tagsToAdd.Count > 0)
                {
                    foreach (var tag in tagsToAdd)
                    {
                        if (syncFilterTags.Count > 0 && !syncFilterTags.Contains(tag))
                        {
                            continue;
                        }

                        var formattedTag = $"{tagPrefix}{tag}";

                        if (!existingTags.Contains(formattedTag, StringComparer.OrdinalIgnoreCase))
                        {
                            existingTags.Add(formattedTag);
                            modified = true;
                        }
                    }
                }

                if (modified)
                {
                    item.Tags = existingTags.ToArray();
                    await item.UpdateToRepositoryAsync(ItemUpdateType.MetadataEdit, cancellationToken);
                    updatedCount++;
                    updatedItemNames.Add(item.Name);

                    if (updatedItemNames.Count >= 50)
                    {
                        _logger.Info($"Updated tags for {updatedItemNames.Count} items: {string.Join(", ", updatedItemNames.Take(10))}...");
                        updatedItemNames.Clear();
                    }
                }

                processedItems++;
                var currentProgress = 50 + (int)((double)processedItems / totalItems * 50);
                progress?.Report(currentProgress);
            }

            if (updatedItemNames.Count > 0)
            {
                if (updatedItemNames.Count <= 10)
                {
                    _logger.Info($"Updated tags for: {string.Join(", ", updatedItemNames)}");
                }
                else
                {
                    _logger.Info($"Updated tags for {updatedItemNames.Count} items: {string.Join(", ", updatedItemNames.Take(10))}...");
                }
            }

            if (failedRadarrInstances.Count + failedSonarrInstances.Count > 0)
            {
                _logger.Warning($"Arr Tags Sync completed with {failedRadarrInstances.Count + failedSonarrInstances.Count} instance failures. "
                    + $"Updated {updatedCount}/{totalItems} items. Failed: Radarr=[{string.Join(", ", failedRadarrInstances)}] "
                    + $"Sonarr=[{string.Join(", ", failedSonarrInstances)}].");
            }
            else
            {
                _logger.Info($"Arr Tags Sync completed. Updated {updatedCount} items out of {totalItems}");
            }
            progress?.Report(100);
        }
    }
}
