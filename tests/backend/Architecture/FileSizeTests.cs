using Xunit.Abstractions;

namespace JE.Tests.Architecture;

// Guardrail §7.1 (artifacts/restructure-plan/backend.md), REPORT-ONLY from S0 (S3 makes it fail, with a shrinking
// allow-list): any *.cs under Features/** or Shared/** over 1,500 lines, and any Je*Controller*.cs over 1,200 lines.
// Generated *.g.cs files are exempt. Also lists every plugin .cs file over 1,500 lines wherever it lives, which is
// the allow-list S3 starts from once Phase 1/2 have moved those files under Features/ or Shared/.
public class FileSizeTests(ITestOutputHelper output)
{
    public const int FeatureFileLimit = 1500;
    public const int ControllerFileLimit = 1200;

    internal static IEnumerable<(string Path, int Lines)> SourceFiles()
    {
        var root = Arch.PluginSource;
        return Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories)
            .Select(f => Path.GetRelativePath(root, f).Replace('\\', '/'))
            .Where(f => !f.StartsWith("bin/", StringComparison.Ordinal) && !f.StartsWith("obj/", StringComparison.Ordinal))
            .Order(StringComparer.Ordinal)
            .Select(f => (f, File.ReadLines(Path.Combine(root, f)).Count()));
    }

    internal static int? LimitFor(string path)
    {
        if (path.EndsWith(".g.cs", StringComparison.Ordinal)) return null;
        var name = Path.GetFileName(path);
        if (name.StartsWith("Je", StringComparison.Ordinal) && name.Contains("Controller", StringComparison.Ordinal)) return ControllerFileLimit;
        return path.StartsWith("Features/", StringComparison.Ordinal) || path.StartsWith("Shared/", StringComparison.Ordinal) ? FeatureFileLimit : null;
    }

    [Fact]
    public void ReportsOversizedFiles()
    {
        var files = SourceFiles().ToList();
        var inScope = files.Where(f => LimitFor(f.Path) is int limit && f.Lines > limit).ToList();
        var large = files.Where(f => !f.Path.EndsWith(".g.cs", StringComparison.Ordinal) && f.Lines > FeatureFileLimit)
            .OrderByDescending(f => f.Lines).ToList();
        output.WriteLine($"plugin .cs files: {files.Count}; over the Features/Shared/Je*Controller limits now: {inScope.Count}; over {FeatureFileLimit} lines anywhere: {large.Count}");
        foreach (var file in inScope) output.WriteLine($"over limit ({LimitFor(file.Path)}): {file.Path} {file.Lines}");
        foreach (var file in large) output.WriteLine($"over {FeatureFileLimit} anywhere: {file.Path} {file.Lines}");
        Assert.NotEmpty(files);
    }
}
