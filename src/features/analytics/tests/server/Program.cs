using System.Reflection;
using System.Text.Json;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Model;
using Jellyfin.Plugin.JellyfinEnhanced.Services;

var checks = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException(name);
    checks++;
}

const string secret = "secret-that-must-never-leave-the-server";
var config = new PluginConfiguration();
// Populate every unannotated string, not just today's API key fields. New
// credentials/free-text fields must also remain excluded as configuration grows.
foreach (var property in typeof(PluginConfiguration).GetProperties().Where(p => p.PropertyType == typeof(string) && p.CanWrite && p.GetCustomAttribute<AnalyticsIncludeAttribute>() == null))
    property.SetValue(config, secret);
config.LanguageTagsPriority = "English, en, zh-Hans-CN, fr, not_a_code, user@example.com, JA";
config.MaintenanceModeAffectedUsers = "[\"private-user-guid\"]";
var settings = AnalyticsConfigurationProjection.GetStringSettings(config);
Check(!JsonSerializer.Serialize(settings).Contains(secret), "all unannotated strings remain private");
Check(settings["LanguageTagsPriority"] == "en,zh-hans-cn,fr,ja", "language preference shares only normalized language code shapes");
Check(settings["MaintenanceModeAffectedUsers"] == "selected" && !JsonSerializer.Serialize(settings).Contains("private-user-guid"), "maintenance users share shape rather than IDs");
Check(settings["MaintenanceModeAction"] == config.MaintenanceModeAction, "annotated fixed-choice settings retain their values");
config.LanguageTagsPriority = "English, Japanese, user@example.com";
config.MaintenanceModeAffectedUsers = "";
settings = AnalyticsConfigurationProjection.GetStringSettings(config);
Check(!settings.ContainsKey("LanguageTagsPriority") && settings["MaintenanceModeAffectedUsers"] == "all", "empty safe language list omitted and default affected users is all");
var flags = AnalyticsConfigurationProjection.GetBooleanFeatureFlags(config);
Check(flags["TmdbEnabled"] && flags["MdblistEnabled"], "API key presence is represented only as flags");
Check(!flags.Keys.Any(k => k.StartsWith("Analytics", StringComparison.Ordinal)), "analytics state excluded from feature flags");
Check(!flags.ContainsKey("DisableScriptInjectionMiddleware") && !flags.ContainsKey("DisableBrandingMiddleware"), "excluded operational flags stay private");
config.TMDB_API_KEY = " ";
config.MdblistApiKey = "";
flags = AnalyticsConfigurationProjection.GetBooleanFeatureFlags(config);
Check(!flags["TmdbEnabled"] && !flags["MdblistEnabled"], "empty and whitespace keys are unconfigured");
Check(JsonSerializer.Serialize(new UsageEventEntry { Key = "seerr.request_submitted", Count = 2 }) == "{\"key\":\"seerr.request_submitted\",\"count\":2}", "analytics event wire keys stay lowercase");
Console.WriteLine($"Passed {checks} analytics checks.");
