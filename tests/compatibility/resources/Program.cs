using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Text.Json;

// Inspect metadata directly: neither host runtime nor Jellyfin dependencies are
// needed to verify an artifact built for the other supported runtime.
var root = Directory.GetCurrentDirectory();
var assemblyPath = args.Length > 0 ? args[0] : throw new ArgumentException("Pass the plugin DLL path.");
using var stream = File.OpenRead(assemblyPath);
using var pe = new PEReader(stream);
var metadata = pe.GetMetadataReader();
var resources = new Dictionary<string, byte[]>(StringComparer.Ordinal);
var resourceBlock = pe.GetSectionData(pe.PEHeaders.CorHeader!.ResourcesDirectory.RelativeVirtualAddress);
foreach (var handle in metadata.ManifestResources)
{
    var resource = metadata.GetManifestResource(handle);
    if (!resource.Implementation.IsNil) continue;
    var reader = resourceBlock.GetReader(checked((int)resource.Offset), resourceBlock.Length - checked((int)resource.Offset));
    resources.Add(metadata.GetString(resource.Name), reader.ReadBytes(reader.ReadInt32()));
}

if (args.Contains("--record"))
{
    Console.WriteLine(JsonSerializer.Serialize(resources.Keys.Order(StringComparer.Ordinal).ToArray(), new JsonSerializerOptions { WriteIndented = true }));
    return;
}

var baseline = JsonSerializer.Deserialize<string[]>(File.ReadAllText(Path.Combine(root, "tests/compatibility/resources/baseline-resources.json")))!;
var preLayout = JsonSerializer.Deserialize<string[]>(File.ReadAllText(Path.Combine(root, "tests/compatibility/resources/pre-layout-resources.json")))!;
foreach (var name in baseline.Concat(preLayout).Distinct(StringComparer.Ordinal))
    if (!resources.ContainsKey(name)) throw new Exception($"Existing resource disappeared: {name}");

var mappedAssets = JsonSerializer.Deserialize<ResourceMapping[]>(
    File.ReadAllText(Path.Combine(root, "artifacts/generated/resource-map.json")))!;
if (mappedAssets.Select(asset => asset.resource).Distinct(StringComparer.Ordinal).Count() != mappedAssets.Length)
    throw new Exception("Duplicate logical resource names in generated resource mapping.");
var checkedCount = 0;
foreach (var asset in mappedAssets)
{
    var relative = asset.source;
    var path = Path.Combine(root, relative);
    var name = asset.resource;
    if (!resources.TryGetValue(name, out var content))
        throw new Exception($"Resource cannot be found by its public path: {relative} ({name})");
    if (!content.AsSpan().SequenceEqual(File.ReadAllBytes(path)))
        throw new Exception($"Embedded resource is stale: {relative}");
    checkedCount++;
}
Console.WriteLine($"Artifact contracts passed: {baseline.Length} upstream and {preLayout.Length} pre-layout resource names retained; {checkedCount} resources match source bytes.");

record ResourceMapping(string source, string resource);
