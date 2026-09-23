using Jellyfin.Plugin.JellyfinEnhanced;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using MediaBrowser.Common.Configuration;
using Newtonsoft.Json.Linq;
using System.Xml.Serialization;
using System.Xml.Linq;

var contractTypes = typeof(UserSettings).Assembly.GetTypes()
    .Where(type => type.IsPublic && type.Namespace == typeof(UserSettings).Namespace)
    .Where(type => type != typeof(UserConfigurationManager))
    .OrderBy(type => type.Name, StringComparer.Ordinal);
var defaults = new JObject();
foreach (var type in contractTypes)
{
    var properties = new JObject();
    foreach (var property in type.GetProperties().OrderBy(property => property.Name, StringComparer.Ordinal))
        properties[property.Name] = property.PropertyType.ToString();
    defaults[type.Name] = new JObject
    {
        ["properties"] = properties,
        ["defaults"] = JToken.FromObject(Activator.CreateInstance(type)!),
    };
}
var xmlSerializer = new XmlSerializer(typeof(PluginConfiguration));
using var xmlWriter = new StringWriter(System.Globalization.CultureInfo.InvariantCulture);
xmlSerializer.Serialize(xmlWriter, new PluginConfiguration());
var xml = xmlWriter.ToString();
using var xmlReader = new StringReader(xml);
var restoredConfiguration = (PluginConfiguration)xmlSerializer.Deserialize(xmlReader)!;
// XmlSerializer appends collection elements to constructor-populated lists. The
// plugin already compensates for that at startup; record the real persisted
// contract here rather than asserting an idealized round-trip behavior.
defaults[nameof(PluginConfiguration)]!["xmlRoundTrip"] = JToken.FromObject(restoredConfiguration);
if (args.Length == 2 && args[0] == "--capture-baseline")
{
    File.WriteAllText(Path.Combine(args[1], "schema-defaults.json"), defaults.ToString() + Environment.NewLine);
    File.WriteAllText(Path.Combine(args[1], "plugin-defaults.xml"), xml);
    Console.WriteLine("Captured configuration schema/default fixtures; review any intentional contract changes.");
    return;
}
var expected = JObject.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "schema-defaults.json")));
Require(JToken.DeepEquals(defaults, expected), "configuration JSON schema/defaults changed from the baseline");
var originalXml = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "plugin-defaults.xml"));
Require(XNode.DeepEquals(CanonicalProperties(xml), CanonicalProperties(originalXml)),
    "plugin XML configuration names, nested ordering or defaults changed from the baseline");
using var originalReader = new StringReader(originalXml);
var upgradedConfiguration = (PluginConfiguration)xmlSerializer.Deserialize(originalReader)!;
Require(JToken.DeepEquals(JToken.FromObject(upgradedConfiguration), expected[nameof(PluginConfiguration)]!["xmlRoundTrip"]),
    "existing plugin XML no longer deserializes with the baseline values");

// Older installations omit settings added in later versions. Exercise each
// serializer's construction path rather than only serializing a fully populated
// object: absent properties must retain all defaults, including nullable policy.
var expectedPluginDefaults = expected[nameof(PluginConfiguration)]!["defaults"]!;
var readers = new (string Name, Func<string, PluginConfiguration> Read, string Empty, string Partial)[]
{
    ("XML", text => (PluginConfiguration)xmlSerializer.Deserialize(new StringReader(text))!,
        "<PluginConfiguration />",
        "<PluginConfiguration><ToastDuration>777</ToastDuration><SpoilerStripOverview>false</SpoilerStripOverview><SpoilerStripSeriesOverview>true</SpoilerStripSeriesOverview></PluginConfiguration>"),
    ("Newtonsoft JSON", text => Newtonsoft.Json.JsonConvert.DeserializeObject<PluginConfiguration>(text)!,
        "{}", "{\"ToastDuration\":777,\"SpoilerStripOverview\":false,\"SpoilerStripSeriesOverview\":true}"),
    ("System.Text.Json", text => System.Text.Json.JsonSerializer.Deserialize<PluginConfiguration>(text)!,
        "{}", "{\"ToastDuration\":777,\"SpoilerStripOverview\":false,\"SpoilerStripSeriesOverview\":true}")
};
foreach (var reader in readers)
{
    var empty = reader.Read(reader.Empty);
    Require(JToken.DeepEquals(JToken.FromObject(empty), expectedPluginDefaults),
        $"{reader.Name}: omitted properties no longer retain baseline defaults");

    var partialExpected = (JObject)expectedPluginDefaults.DeepClone();
    partialExpected[nameof(PluginConfiguration.ToastDuration)] = 777;
    partialExpected[nameof(PluginConfiguration.SpoilerStripOverview)] = false;
    partialExpected[nameof(PluginConfiguration.SpoilerStripSeriesOverview)] = true;
    Require(JToken.DeepEquals(JToken.FromObject(reader.Read(reader.Partial)), partialExpected),
        $"{reader.Name}: explicit values or other absent-property defaults changed");

    AssertIndependentShortcutDefaults(empty, reader.Read(reader.Empty), expectedPluginDefaults,
        reader.Name + " deserialization");
}
AssertIndependentShortcutDefaults(new PluginConfiguration(), new PluginConfiguration(),
    expectedPluginDefaults, "normal construction");

static void AssertIndependentShortcutDefaults(PluginConfiguration first, PluginConfiguration second,
    JToken baseline, string scenario)
{
    Require(!ReferenceEquals(first.Shortcuts, second.Shortcuts), scenario + ": shortcut lists must not be shared");
    Require(first.Shortcuts.Count > 0 && second.Shortcuts.Count > 0
        && !ReferenceEquals(first.Shortcuts[0], second.Shortcuts[0]),
        scenario + ": mutable shortcut objects must not be shared");
    first.Shortcuts[0].Key = "changed-in-another-instance";
    first.Shortcuts.Clear();
    Require(JToken.DeepEquals(JToken.FromObject(second), baseline),
        scenario + ": mutating a shortcut or list must not change another configuration");
}

// XML property order is insignificant for Jellyfin's named settings. Sorting only
// the root settings preserves collection ordering and all nested persisted values.
static XElement CanonicalProperties(string text)
{
    var root = XDocument.Parse(text).Root!;
    return new XElement(root.Name, root.Attributes(), root.Elements().OrderBy(element => element.Name.ToString(), StringComparer.Ordinal));
}

var temporary = Path.Combine(Path.GetTempPath(), "je-configuration-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(temporary);
try
{
    var paths = new Paths(temporary);
    var logger = new Logger();
    var first = new UserConfigurationManager(paths, logger);
    var second = new UserConfigurationManager(paths, logger);
    var storeDirectory = Path.Combine(temporary, "configurations", "Jellyfin.Plugin.JellyfinEnhanced");
    var reviewPath = Path.Combine(storeDirectory, "reviews.json");
    var activityPath = Path.Combine(storeDirectory, "activity.json");
    var user = Guid.NewGuid();

    Require(ReferenceEquals(first.GetUserFileLock(user.ToString("D").ToUpperInvariant(), "settings.json"),
        second.GetUserFileLock(user.ToString("N"), "settings.json")), "user IDs share the same lock across manager instances");
    first.SaveUserConfiguration(user.ToString("D").ToUpperInvariant(), "settings.json", new UserSettings { AutoPauseEnabled = true });
    Require(second.GetUserConfiguration<UserSettings>(user.ToString("N"), "settings.json").AutoPauseEnabled,
        "hyphenated uppercase user IDs round-trip through canonical storage");

    Parallel.For(0, 40, index => (index % 2 == 0 ? first : second)
        .UpsertReview("user-" + index, "movie", "123", "review-" + index, 8, "2026-01-01T00:00:00Z"));
    Require(first.GetAllReviews().Reviews.Count == 40, "parallel reviews across manager instances cannot lose updates");
    first.UpsertReview("user-0", "movie", "123", "edited", 9, "2026-02-01T00:00:00Z");
    var edited = second.GetAllReviews().Reviews["user-0:movie:123"];
    Require(edited.CreatedAt == "2026-01-01T00:00:00Z" && edited.UpdatedAt == "2026-02-01T00:00:00Z" && edited.Content == "edited",
        "review updates preserve creation date and change the existing record");
    Require(first.DeleteReview("user-0", "movie", "123") && !second.DeleteReview("user-0", "movie", "123"),
        "delete reports whether a review existed");

    foreach (var invalid in new[] { "", "null", "{not-json" })
    {
        File.WriteAllText(reviewPath, invalid);
        Require(first.GetAllReviews().Reviews.Count == 0, "read-only review fallback remains lenient");
        Throws(() => second.UpsertReview("user", "movie", "123", "new", null, "now"), "review writes reject corruption");
        Require(File.ReadAllText(reviewPath) == invalid, "failed review mutation preserves the corrupt original");
        Require(Directory.GetFiles(storeDirectory, "reviews.json.corrupt-*").Length > 0, "review corruption gets a recovery backup");
    }

    Parallel.For(0, 40, index => (index % 2 == 0 ? first : second)
        .RecordActivity("user-" + index, "item", "Watched", "2026-01-01T00:00:00Z", true, 90));
    Require(first.GetAllActivity().Entries.Count == 40, "parallel activity writes across manager instances cannot lose updates");
    second.RecordActivity("user-0", "item", "Watched", "2026-02-01T00:00:00Z", false, 10);
    var watched = first.GetAllActivity().Entries["user-0:item:Watched"];
    Require(watched.Completed && watched.Progress == 90 && watched.OccurredAt == "2026-02-01T00:00:00Z",
        "rewatching refreshes time without downgrading completion/progress");
    first.RecordActivity("user", "item", "Favorited", "first");
    second.RecordActivity("user", "item", "Favorited", "second");
    Require(first.GetAllActivity().Entries["user:item:Favorited"].OccurredAt == "first", "favorite timestamp stays stable");
    second.RemoveActivity("user", "item", "Favorited");
    first.RecordActivity("user", "item", "Favorited", "third");
    Require(second.GetAllActivity().Entries["user:item:Favorited"].OccurredAt == "third", "refavoriting records a new event");

    foreach (var invalid in new[] { "", "null", "{}", "{\"Entries\":null}", "{\"Entries\":{}} trailing" })
    {
        File.WriteAllText(activityPath, invalid);
        Require(first.GetAllActivity().Entries.Count == 0, "read-only activity fallback remains lenient");
        Throws(() => second.RecordActivity("user", "item", "Watched", "now"), "activity writes reject corruption");
        Require(File.ReadAllText(activityPath) == invalid, "failed activity mutation preserves the corrupt original");
    }

    File.Delete(activityPath);
    for (var index = 0; index < 503; index++)
        first.RecordActivity("user", index.ToString(), "Watched", index.ToString("D4"));
    var bounded = second.GetAllActivity().Entries;
    Require(bounded.Count == 500 && !bounded.ContainsKey("user:0:Watched") && bounded.ContainsKey("user:502:Watched"),
        "activity retains the newest 500 entries");
    Require(Directory.GetFiles(storeDirectory, "activity.json.*.tmp").Length == 0, "atomic activity writes clean temporary files");
    Console.WriteLine("Configuration storage contracts passed.");
}
finally
{
    Directory.Delete(temporary, recursive: true);
}

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static void Throws(Action action, string message)
{
    try { action(); }
    catch { return; }
    throw new InvalidOperationException(message);
}

sealed record Paths(string PluginsPath) : IApplicationPaths;
