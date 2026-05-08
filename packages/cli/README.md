# tinyflag-cli

CLI tools for [TinyFlag](https://www.npmjs.com/package/tinyflag) feature flags.

[![npm version](https://img.shields.io/npm/v/tinyflag-cli)](https://www.npmjs.com/package/tinyflag-cli)
[![license](https://img.shields.io/npm/l/tinyflag-cli)](https://github.com/josedab/tinyflag/blob/main/LICENSE)

## Install

```bash
npm install -g tinyflag-cli
# or use directly with npx
npx tinyflag <command>
```

## Commands

### Validate

Validate a flags file against the TinyFlag schema:

```bash
npx tinyflag validate ./flags.yml
```

### Generate Types

Generate TypeScript type definitions from your flag file:

```bash
npx tinyflag generate ./flags.yml
npx tinyflag generate ./flags.yml -o ./src/flags.d.ts
```

### Diff

Show flag changes between git refs:

```bash
npx tinyflag diff main..HEAD
npx tinyflag diff main..HEAD --file config/flags.yml
```

## Documentation

- [CLI Documentation](https://github.com/josedab/tinyflag/blob/main/docs/cli.md) — Full CLI reference
- [Flag Format](https://github.com/josedab/tinyflag/blob/main/docs/flag-format.md) — YAML/JSON configuration reference
- [GitHub Action](https://github.com/josedab/tinyflag/blob/main/docs/github-action.md) — CI/CD integration

## License

[MIT](https://github.com/josedab/tinyflag/blob/main/LICENSE)
