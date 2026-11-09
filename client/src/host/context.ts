/**
 * The platform services a feature may reach through host/ (frontend.md §2.3; feature-boundaries rule 1 allows
 * features to import this file). Step C2 adds the `FeatureContext` factory here. For now it re-exports, types
 * only, the settings document and save options the core settings service uses.
 */
export type { SaveOptions, SettingsDocument } from './settings-host';
