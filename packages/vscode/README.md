# TinyFlag VS Code Extension

IntelliSense, hover previews, go-to-definition, CodeLens, and diagnostics for TinyFlag feature flags.

## Features

- **Autocomplete** flag names inside `isEnabled()` and `getVariant()` calls
- **Hover previews** showing enabled state, rollout %, rules count, variants, and tags
- **Go-to-definition** from flag usage in code to the YAML definition
- **CodeLens** showing flag status inline above each usage
- **Diagnostics** warning about undefined or disabled flags

## Configuration

| Setting              | Default     | Description                                   |
| -------------------- | ----------- | --------------------------------------------- |
| `tinyflag.flagsFile` | `flags.yml` | Path to flags file relative to workspace root |

## Usage

1. Open a workspace containing a `flags.yml` file
2. The extension activates automatically
3. Start typing flag names in `isEnabled('` or `getVariant('` calls
