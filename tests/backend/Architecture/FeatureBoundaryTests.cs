using System.Reflection;
using System.Text;
using System.Text.Json;
using Xunit.Abstractions;

namespace JE.Tests.Architecture;

// Guardrail §7.2 (artifacts/restructure-plan/backend.md), FAILING for every feature from S3 (S0–S2 enforced it per
// feature through an "enforced" list in feature-dependencies.json, now retired). Reflection only: for every
// type in namespace …Features.<A>, the types it references through constructor/method parameters, return types,
// fields, properties, base types and IL member/type tokens (the Gate B decoder). An edge Features.<A> → Features.<B>
// is a finding unless allow-listed; a controller may reference no other feature at all. One exception for both
// (coordinator decision, step 8; backend.md §7.7): a reference into another feature's own …Features.<B>.PublicApi
// namespace is allowed, the forwarding-only surface that feature defines for the others. Anything else in
// Features.<B> stays a finding.
//
// Shared/** and Infrastructure/** (review M2): moving a type out of Features.<A> into Shared can launder a
// cross-feature edge (Features.<B> → Shared.X → Features.<A>), and the scan above never looked there. Their references
// into Features.* are therefore RATCHETED: shared-feature-references.baseline.json records, per referencing top-level
// type → referenced Features type, how often it is referenced (each signature slot and each IL token, nested and
// compiler-generated types counted with their outermost type). A new edge or a higher count fails; a lower count or a
// vanished edge is a note (shrink the file). The baseline records the state when it was introduced and widens nothing.
public class FeatureBoundaryTests(ITestOutputHelper output)
{
    private const string FeaturesPrefix = Arch.PluginNamespace + ".Features.";
    private const BindingFlags All = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;

    internal static string? FeatureOf(Type type)
    {
        var ns = type.Namespace;
        if (ns == null || !ns.StartsWith(FeaturesPrefix, StringComparison.Ordinal)) return null;
        return ns[FeaturesPrefix.Length..].Split('.')[0];
    }

    // A type in Features.<F>.PublicApi (or below it): the surface feature F offers the other features.
    internal static bool IsPublicApi(Type type)
    {
        var ns = type.Namespace;
        if (ns == null || !ns.StartsWith(FeaturesPrefix, StringComparison.Ordinal)) return false;
        var parts = ns[FeaturesPrefix.Length..].Split('.');
        return parts.Length > 1 && parts[1] == "PublicApi";
    }

    private static IEnumerable<Type> Expand(Type? type)
    {
        if (type == null) yield break;
        if (type.HasElementType) { foreach (var t in Expand(type.GetElementType())) yield return t; yield break; }
        if (type.IsGenericParameter) yield break;
        yield return type;
        if (type.IsGenericType)
            foreach (var argument in type.GetGenericArguments())
                foreach (var t in Expand(argument)) yield return t;
    }

    internal static IEnumerable<Type> References(Type type)
    {
        var direct = new List<Type?> { type.BaseType };
        direct.AddRange(type.GetInterfaces());
        direct.AddRange(type.GetFields(All).Select(f => f.FieldType));
        direct.AddRange(type.GetProperties(All).Select(p => p.PropertyType));
        foreach (var method in Arch.AllMethods(type))
        {
            direct.AddRange(method.GetParameters().Select(p => p.ParameterType));
            if (method is MethodInfo info) direct.Add(info.ReturnType);
            foreach (var member in Arch.IlReferences(method))
                direct.Add(member as Type ?? member.DeclaringType);
        }
        foreach (var nested in type.GetNestedTypes(BindingFlags.Public | BindingFlags.NonPublic))
            direct.AddRange(nested.GetFields(All).Select(f => f.FieldType));
        return direct.SelectMany(Expand).Distinct();
    }

    private sealed record Map(Dictionary<string, string[]> Allow);

    private static Map LoadMap()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(Arch.SnapshotDirectory, "feature-dependencies.json")));
        Assert.False(json.RootElement.TryGetProperty("enforced", out _), "feature-dependencies.json: \"enforced\" is retired; every feature is enforced (S3)");
        var allow = json.RootElement.GetProperty("allow").EnumerateObject()
            .ToDictionary(p => p.Name, p => p.Value.EnumerateArray().Select(e => e.GetString()!).ToArray());
        return new Map(allow);
    }

    [Fact]
    public void FeatureReferencesStayInsideTheAllowList()
    {
        var map = LoadMap();
        var featureTypes = Arch.PluginTypes().Where(t => t.DeclaringType == null && FeatureOf(t) != null).ToList();
        var findings = new List<(string Feature, string Text)>();
        var edges = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var type in featureTypes)
        {
            var from = FeatureOf(type)!;
            var isController = Arch.IsControllerType(type);
            foreach (var target in References(type).Where(t => t.Assembly == Arch.Plugin))
            {
                var to = FeatureOf(target);
                if (to == null || to == from) continue;
                var publicApi = IsPublicApi(target);
                edges.Add($"{from} -> {to}{(publicApi ? " (PublicApi)" : "")}");
                var allowed = publicApi || (!isController && map.Allow.TryGetValue(from, out var targets) && (targets.Contains("*") || targets.Contains(to)));
                if (!allowed) findings.Add((from, $"{type.Name} ({from}{(isController ? ", controller" : "")}) -> {target.Name} ({to})"));
            }
        }
        output.WriteLine($"feature namespaces: {string.Join(", ", featureTypes.Select(FeatureOf).Distinct().Order(StringComparer.Ordinal))}");
        output.WriteLine($"types in Features.*: {featureTypes.Count}; cross-feature edges: {edges.Count}; findings: {findings.Count}; enforced: every feature");
        foreach (var edge in edges) output.WriteLine("edge: " + edge);
        foreach (var (from, targets) in map.Allow)
            foreach (var to in targets.Where(to => to != "*" && !edges.Contains($"{from} -> {to}")))
                output.WriteLine($"note: allow-list entry {from} -> {to} is unused");
        foreach (var finding in findings) output.WriteLine("finding: " + finding.Text);
        Assert.True(findings.Count == 0, "Cross-feature references outside feature-dependencies.json (backend.md §7.2):\n" + string.Join("\n", findings.Select(f => f.Text)));
    }

    public const string SharedBaselineFile = "shared-feature-references.baseline.json";
    private static readonly string[] SharedPrefixes = [Arch.PluginNamespace + ".Shared", Arch.PluginNamespace + ".Infrastructure"];

    internal static bool IsSharedOrInfrastructure(Type type)
        => type.Namespace is { } ns && SharedPrefixes.Any(p => ns == p || ns.StartsWith(p + ".", StringComparison.Ordinal));

    private static string Short(Type type)
    {
        var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        var name = definition.FullName ?? definition.Name;
        return name.StartsWith(Arch.PluginNamespace + ".", StringComparison.Ordinal) ? name[(Arch.PluginNamespace.Length + 1)..] : name;
    }

    // Every occurrence (not distinct) of a type in the signatures and IL of `type` and its nested types.
    private static IEnumerable<Type> ReferenceOccurrences(Type type)
    {
        var direct = new List<Type?> { type.BaseType };
        direct.AddRange(type.GetInterfaces());
        direct.AddRange(type.GetFields(All).Select(f => f.FieldType));
        direct.AddRange(type.GetProperties(All).Select(p => p.PropertyType));
        const BindingFlags declared = All;
        foreach (var method in type.GetMethods(declared).Cast<MethodBase>().Concat(type.GetConstructors(declared)))
        {
            direct.AddRange(method.GetParameters().Select(p => p.ParameterType));
            if (method is MethodInfo info) direct.Add(info.ReturnType);
            foreach (var member in Arch.IlReferences(method))
                direct.Add(member as Type ?? member.DeclaringType);
        }
        foreach (var t in direct.SelectMany(Expand)) yield return t;
        foreach (var nested in type.GetNestedTypes(BindingFlags.Public | BindingFlags.NonPublic))
            foreach (var t in ReferenceOccurrences(nested)) yield return t;
    }

    internal static SortedDictionary<string, int> SharedFeatureEdges()
    {
        var edges = new SortedDictionary<string, int>(StringComparer.Ordinal);
        foreach (var type in Arch.PluginTypes().Where(t => t.DeclaringType == null && IsSharedOrInfrastructure(t)))
        {
            foreach (var target in ReferenceOccurrences(type).Where(t => t.Assembly == Arch.Plugin && FeatureOf(t) != null))
            {
                var key = $"{Short(type)} -> {Short(target)}";
                edges[key] = edges.GetValueOrDefault(key) + 1;
            }
        }
        return edges;
    }

    internal static string RenderSharedBaseline(SortedDictionary<string, int> edges)
    {
        var text = new StringBuilder("{\n  \"comment\": ");
        text.Append(JsonSerializer.Serialize("FeatureBoundaryTests ratchet (review M2): Shared.* and Infrastructure.* references into Features.*, referencing top-level type -> referenced type: occurrences. A new edge or a higher count fails; lower counts are a note, so shrink this file when an edge goes away. Never add an edge to make the test pass.", Arch.Json));
        text.Append(",\n  \"edges\": {\n");
        text.Append(string.Join(",\n", edges.Select(e => $"    {JsonSerializer.Serialize(e.Key, Arch.Json)}: {e.Value}")));
        text.Append("\n  }\n}\n");
        return text.ToString();
    }

    [Fact]
    public void SharedAndInfrastructureFeatureReferencesDoNotGrow()
    {
        var edges = SharedFeatureEdges();
        var path = Path.Combine(Arch.SnapshotDirectory, SharedBaselineFile);
        output.WriteLine($"Shared/Infrastructure -> Features edges: {edges.Count}, occurrences: {edges.Values.Sum()}");
        foreach (var edge in edges) output.WriteLine($"edge: {edge.Key}: {edge.Value}");
        if (Arch.UpdateSnapshots)
        {
            File.WriteAllText(path, RenderSharedBaseline(edges), new UTF8Encoding(false));
            return;
        }
        using var json = JsonDocument.Parse(File.ReadAllText(path));
        var baseline = json.RootElement.GetProperty("edges").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetInt32(), StringComparer.Ordinal);
        var grown = edges.Where(e => e.Value > baseline.GetValueOrDefault(e.Key))
            .Select(e => baseline.TryGetValue(e.Key, out var was) ? $"{e.Key}: {was} -> {e.Value}" : $"{e.Key}: new ({e.Value})").ToList();
        foreach (var gone in baseline.Where(b => edges.GetValueOrDefault(b.Key) < b.Value))
            output.WriteLine($"note: {gone.Key}: baseline {gone.Value}, now {edges.GetValueOrDefault(gone.Key)} (shrink {SharedBaselineFile})");
        Assert.True(grown.Count == 0, $"Shared/Infrastructure -> Features references grew beyond {SharedBaselineFile}:\n" + string.Join("\n", grown));
    }
}
