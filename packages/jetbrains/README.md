# TinyFlag JetBrains Plugin

IntelliJ/WebStorm plugin for TinyFlag feature flags.

## Features

- **Flag Name Autocomplete** — Complete flag names in `isEnabled()`, `getVariant()`, and `getConfig()` calls
- **Hover Previews** — See current state, rollout percentage, description, and variants on hover
- **Inline Annotations** — Flag status indicators in the editor
- **Go to Definition** — Navigate from flag name in code to the YAML definition

## Requirements

- IntelliJ IDEA 2023.3+ / WebStorm 2023.3+
- YAML plugin (bundled)

## Building

```bash
./gradlew buildPlugin
```

## Installing

```bash
./gradlew runIde          # Run a sandbox IDE with the plugin
./gradlew buildPlugin     # Build distributable ZIP
```

## Development

The plugin looks for `flags.yml`, `flags.yaml`, or `flags.json` files in the project root and subdirectories (excluding `node_modules` and `.git`).

### Architecture

- `TinyFlagService` — Project-level service that loads and caches flag definitions
- `TinyFlagCompletionContributor` — Provides autocomplete for flag names
- `TinyFlagAnnotator` — Annotates flag name literals with status information
