# Review JE changes

Read the change's intent, baseline, scoped diff (including new files) and covering test output. Review a stable revision: record its commit or file hashes and report if the files change during review. A review of an earlier revision does not clear later behavior changes.

Prioritize observable failures:
- Identity and authorization: server/user changes, logout and return to the same account; stale work must not apply to another session. Check server enforcement and protected responses, not just hidden controls.
- Persistence: retain existing settings, bookmarks and overrides; migrations must survive interrupted writes and invalid documents.
- Lifecycle: exercise repeated navigation, replacement, cancellation and disposal. Look for duplicate listeners, detached UI updates and leaked timers.
- Feature parity: cover all entry points, host layouts, native-client server behavior and translations affected by the slice. Follow callers across module and transport boundaries.
- Build/runtime: test actual generated assets and real routes. Types cannot validate network data or prove a Jellyfin host loads the plugin.

Report each finding with a stable ID, severity, file/line, concrete trigger and consequence, and reproduction or source evidence. Separate introduced defects from pre-existing ones. Do not report style preferences as bugs or infer a defect from a name. Say when no actionable defect was found and what was not exercised.

The implementation owner verifies findings and records fixed, rejected-with-evidence or unresolved outcomes. Fix the relevant bug class rather than repeated instances one at a time. Add focused regression coverage where it catches behavior that can break. Prefer enforceable types, runtime boundaries and checks over accumulating prose rules.

One independent pass reviews the whole slice. Further passes cover changed behavior and unresolved findings. Reconsider the design after three rounds instead of indefinitely generating more comments; unresolved defects remain unresolved. A score, model agreement or exhausted round budget is not proof.

Run focused checks during iteration and the combined gate after integration. Review effort follows consequences: account isolation, permissions, persistence and deployment paths need deeper evidence than copy edits. Preserve the existing assertions unless an intentional behavior change justifies changing them. Record real-host and visual gaps honestly.

Implementation and validation must stay in the isolated rewrite checkout on the designated compute hosts. The rewrite is not complete while production modules or inline admin behavior remain unaccounted for.
