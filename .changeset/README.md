# Changesets

This project uses [changesets](https://github.com/changesets/changesets) for version management and changelog generation.

## Adding a changeset

When you make a change that should be released, run:

```bash
pnpm changeset
```

This will prompt you to select the packages that changed and the type of change (major, minor, patch).

A changeset file will be created in the `.changeset` directory. Commit this file with your PR.

## Publishing

Publishing is automated via the release GitHub Action. When changesets are merged to `main`, a "Version Packages" PR is automatically created. Merging that PR triggers the publish to npm.
