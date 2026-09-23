using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

// This fixture records the upstream HTTP contract before the controller split. It protects
// routes, verbs, authorization/size/cache attributes, parameter binding, and default values.
var root = FindRepositoryRoot();
var fixture = JsonSerializer.Deserialize<List<ActionContract>>(
    File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "controller-contract-baseline.json")))!;
var expected = fixture.ToDictionary(x => x.name, x => CanonicalSignature(ParseMethod(x.signature)));
var actual = new Dictionary<string, string>();
var failures = new List<string>();
foreach (var path in Directory.EnumerateFiles(Path.Combine(root, "src"), "*.cs", SearchOption.AllDirectories)
    .Where(path => !Path.GetRelativePath(root, path).Split(Path.DirectorySeparatorChar).Any(part => part is "tests" or "bin" or "obj")))
{
    var syntax = CSharpSyntaxTree.ParseText(File.ReadAllText(path)).GetCompilationUnitRoot();
    foreach (var method in syntax.DescendantNodes().OfType<MethodDeclarationSyntax>())
    {
        if (method.Parent is not ClassDeclarationSyntax controller
            || !controller.Identifier.ValueText.EndsWith("Controller", StringComparison.Ordinal)
                && !controller.Identifier.ValueText.EndsWith("ControllerBase", StringComparison.Ordinal)
            || controller.Modifiers.Any(SyntaxKind.StaticKeyword)
            || !method.Modifiers.Any(SyntaxKind.PublicKeyword)
            || method.Modifiers.Any(SyntaxKind.StaticKeyword)) continue;
        if (!IsHttpAction(method) && !method.AttributeLists.SelectMany(x => x.Attributes).Any(x => x.Name.ToString() == "NonAction"))
            failures.Add($"Public controller helper could become an accidental MVC action: {controller.Identifier}.{method.Identifier}");
    }
    foreach (var method in syntax.DescendantNodes().OfType<MethodDeclarationSyntax>().Where(IsHttpAction))
    {
        var name = method.Identifier.ValueText;
        if (!actual.TryAdd(name, CanonicalSignature(method)))
            failures.Add($"Duplicate HTTP action name: {name}");
        var controller = (ClassDeclarationSyntax)method.Parent!;
        var route = controller.AttributeLists.SelectMany(x => x.Attributes).SingleOrDefault(x => x.Name.ToString() == "Route");
        if (route?.ArgumentList?.Arguments.Single().Expression.ToString() != "\"JellyfinEnhanced\"")
            failures.Add($"Unexpected route prefix: {controller.Identifier}");
        if (!controller.AttributeLists.SelectMany(x => x.Attributes).Any(x => x.Name.ToString() == "ApiController"))
            failures.Add($"Missing ApiController behavior: {controller.Identifier}");
    }
}
foreach (var (name, signature) in expected)
{
    if (!actual.TryGetValue(name, out var found)) failures.Add($"Missing HTTP action: {name}");
    else if (found != signature) failures.Add($"Changed HTTP action contract: {name}\nExpected: {signature}\nActual:   {found}");
}
foreach (var extra in actual.Keys.Except(expected.Keys)) failures.Add($"Unrecorded HTTP action: {extra}");
if (failures.Count > 0) throw new InvalidOperationException(string.Join("\n", failures));
Console.WriteLine($"PASS: {expected.Count} upstream HTTP action contracts, including routes, authorization, binding and defaults.");

await SeerrStatusScenarios.RunAsync();

static bool IsHttpAction(MethodDeclarationSyntax method) => method.AttributeLists.SelectMany(x => x.Attributes).Any(x => x.Name.ToString().StartsWith("Http", StringComparison.Ordinal));
static MethodDeclarationSyntax ParseMethod(string signature) => (MethodDeclarationSyntax)SyntaxFactory.ParseMemberDeclaration(signature + ";")!;
static string CanonicalSignature(MethodDeclarationSyntax method) => string.Join(" ", method.WithBody(null).WithExpressionBody(null).WithSemicolonToken(default).DescendantTokens().Select(x => x.Text));
static string FindRepositoryRoot()
{
    for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
        if (File.Exists(Path.Combine(dir.FullName, "src", "JellyfinEnhanced.csproj"))) return dir.FullName;
    throw new DirectoryNotFoundException("Cannot locate the repository from the test output directory.");
}
record ActionContract(string name, string signature, string attributes);
