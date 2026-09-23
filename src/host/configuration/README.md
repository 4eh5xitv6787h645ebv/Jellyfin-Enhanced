# Stable configuration contract

`PluginConfiguration.cs` declares the CLR identity and base type of the existing
flat Jellyfin configuration. Properties live with their owners:

- `src/features/<feature>/settings/PluginConfiguration.<Feature>.cs` holds a
  feature's properties, attributes and default values.
- `PluginConfiguration.Host.cs` holds the host script-injection switch.
- `src/features/<feature>/settings/UserSettings.<Feature>.cs` contributes to the
  shared per-user `settings.json` model. Separate saved objects, such as
  `UserSpoilerBlur`, belong in the corresponding feature's settings directory.

Set each default beside its property. C# combines the partial declarations into
one type and supplies the public parameterless constructor used by serializers.
There is no defaults helper to register or constructor call to add. Collection
initializers create a separate collection for each configuration instance.

```csharp
public bool SpoilerBlurStrictRefresh { get; set; } = false;
```

These declarations preserve the public type names, property names, types and
serialization attributes. Existing installations still read one
`PluginConfiguration` and one `UserSettings` object; source ownership does not
introduce a nested configuration format.

When adding a setting, update its feature's dashboard control and load/read
behavior. If ordinary browser code needs the value through `JE.pluginConfig`,
check the explicit projection in `src/host/api/ConfigurationController.cs`.
Server-only properties need no browser projection; keep sensitive values out of
public configuration.

Run `npm run check:backend` for the schema/storage compatibility suite under
`tests/compatibility/configuration/storage/`. It protects property names, types,
defaults, existing XML reads, collection behavior and storage concurrency. XML
root property order can change when declarations move; nested collection order
and persisted values remain significant. Fixture changes require an intentional
schema change, not just a file move.

The [dashboard guide](../dashboard/README.md) explains control composition. The
[Spoiler Guard walkthrough](../../../docs/advanced/spoiler-guard-development.md)
traces a setting, browser action, endpoint and focused test through the feature.
