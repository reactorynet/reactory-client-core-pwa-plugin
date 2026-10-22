# Reactory Core Plugin

This plugin directory houses core Reactory components migrated to the PWA client plugin architecture.

## Structure

- `index.ts`: Exports `components: Reactory.Client.IReactoryComponentRegistryEntry<any>[]` registered into the client component registry.
- Individual components should be organized into subfolders or component files within this directory.
- `theme-editor/`: shared, transport-agnostic theme editing surface (`ThemeEditor`, `ThemeCssStudio`) plus the canonical theme defaults/model helpers. Hosts such as `ApplicationThemesPanel` and the organization branding tab own persistence and pass mutations in via props.
- `demographic-form/`: shared, transport-agnostic demographic form renderer (`DemographicForm`, `DemographicFieldRenderer`). Maps a `DemographicDefinition` to an input — a bound `widget.componentFqn` first, then a built-in control per `valueType` (`object` and `array` render through the shared form engine) — resolves `widget.componentPropsMap`, and renders per-field errors. Hosts (organization demographics configuration, admin and self-service values) own fetching and persistence and pass values plus `onChange` in via props.