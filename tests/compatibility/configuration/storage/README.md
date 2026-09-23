# Configuration storage and serialization contracts

```sh
dotnet run --project tests/compatibility/configuration/storage/StorageTests.csproj
```

This executable links the production configuration models, manager, and stores.
Only Jellyfin's application-path/logger boundaries and unrelated spoiler-cache
invalidation are stubbed. Jellyfin's real `BasePluginConfiguration` comes from the
pinned model package. Tests create and delete their own temporary directory.

`schema-defaults.json` records public property types, Newtonsoft JSON defaults for
every configuration model, and plugin defaults after an XML round-trip.
`plugin-defaults.xml` records the XML emitted by `XmlSerializer`. Both were captured
using the original `PluginConfiguration.cs` and `UserConfiguration.cs` from commit
`cfa35a7`, compiled in an isolated temporary project, then checked against the
refactored sources.

The XML round-trip contains the existing appended shortcut entries from
constructor defaults. Preserve that baseline; startup normalization owns handling
it. Snapshot updates are appropriate only for a reviewed, intentional configuration
contract change. To capture a proposed update explicitly:

```sh
dotnet run --project tests/compatibility/configuration/storage/StorageTests.csproj -- --capture-baseline tests/compatibility/configuration/storage
```

XML compatibility compares root properties by name while preserving nested collection order,
and deserializes the original XML fixture to verify upgrade compatibility. Partial schema
files can change declaration order without changing persisted setting values.

Always review fixture diffs. Normal test runs never update fixtures.
