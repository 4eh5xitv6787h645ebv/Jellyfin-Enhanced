using System.Text.RegularExpressions;
using Xunit.Abstractions;

namespace JE.Tests.Architecture;

// Guardrail §7.3 (artifacts/restructure-plan/backend.md), REPORT-ONLY from S0 (S3 makes it fail): a file under
// Features/<F>/ must declare namespace …Features.<F>[.*], and no .cs file may live in the retired folders. Phase 1
// moves files with their namespaces unchanged, so mismatches are expected until each Phase 2 step renames them.
public partial class FolderNamespaceTests(ITestOutputHelper output)
{
    public static readonly string[] RetiredFolders = ["Services", "Helpers", "Model", "ScheduledTasks", "EventHandlers", "Controllers"];

    [GeneratedRegex(@"^\s*namespace\s+([\w.]+)", RegexOptions.Multiline)]
    private static partial Regex NamespaceDeclaration();

    [Fact]
    public void ReportsNamespaceMismatchesAndRetiredFolders()
    {
        var files = FileSizeTests.SourceFiles().Select(f => f.Path).ToList();
        var mismatches = new List<string>();
        foreach (var path in files.Where(p => p.StartsWith("Features/", StringComparison.Ordinal)))
        {
            var feature = path.Split('/')[1];
            var expected = $"{Arch.PluginNamespace}.Features.{feature}";
            var declared = NamespaceDeclaration().Matches(File.ReadAllText(Path.Combine(Arch.PluginSource, path))).Select(m => m.Groups[1].Value).ToList();
            if (declared.Count == 0 || declared.Any(ns => ns != expected && !ns.StartsWith(expected + ".", StringComparison.Ordinal)))
                mismatches.Add($"{path}: namespace {(declared.Count == 0 ? "(none)" : string.Join(", ", declared))}, expected {expected}[.*]");
        }
        var retired = RetiredFolders.ToDictionary(f => f, f => files.Count(p => p.StartsWith(f + "/", StringComparison.Ordinal)));
        output.WriteLine($"files under Features/: {files.Count(p => p.StartsWith("Features/", StringComparison.Ordinal))}; namespace mismatches: {mismatches.Count}");
        foreach (var mismatch in mismatches) output.WriteLine("mismatch: " + mismatch);
        output.WriteLine("retired folders (.cs files): " + string.Join(", ", retired.Select(r => $"{r.Key} {r.Value}")));
        Assert.NotEmpty(files);
    }
}
