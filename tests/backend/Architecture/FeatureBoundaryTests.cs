using System.Reflection;
using System.Text.Json;
using Xunit.Abstractions;

namespace JE.Tests.Architecture;

// Guardrail §7.2 (artifacts/restructure-plan/backend.md), REPORT-ONLY from S0: findings go to the test output and
// fail only for features listed under "enforced" in feature-dependencies.json (none in S0). Reflection only: for every
// type in namespace …Features.<A>, the types it references through constructor/method parameters, return types,
// fields, properties, base types and IL member/type tokens (the Gate B decoder). An edge Features.<A> → Features.<B>
// is a finding unless allow-listed; a controller may reference no other feature at all.
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

    private sealed record Map(string[] Enforced, Dictionary<string, string[]> Allow);

    private static Map LoadMap()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(Arch.SnapshotDirectory, "feature-dependencies.json")));
        var enforced = json.RootElement.GetProperty("enforced").EnumerateArray().Select(e => e.GetString()!).ToArray();
        var allow = json.RootElement.GetProperty("allow").EnumerateObject()
            .ToDictionary(p => p.Name, p => p.Value.EnumerateArray().Select(e => e.GetString()!).ToArray());
        return new Map(enforced, allow);
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
                edges.Add($"{from} -> {to}");
                var allowed = !isController && map.Allow.TryGetValue(from, out var targets) && (targets.Contains("*") || targets.Contains(to));
                if (!allowed) findings.Add((from, $"{type.Name} ({from}{(isController ? ", controller" : "")}) -> {target.Name} ({to})"));
            }
        }
        output.WriteLine($"feature namespaces: {string.Join(", ", featureTypes.Select(FeatureOf).Distinct().Order(StringComparer.Ordinal))}");
        output.WriteLine($"types in Features.*: {featureTypes.Count}; cross-feature edges: {edges.Count}; findings: {findings.Count}; enforced: [{string.Join(", ", map.Enforced)}]");
        foreach (var edge in edges) output.WriteLine("edge: " + edge);
        foreach (var finding in findings) output.WriteLine("finding: " + finding.Text);
        Assert.Empty(findings.Where(f => map.Enforced.Contains(f.Feature)).Select(f => f.Text));
    }
}
