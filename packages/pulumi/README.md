# TinyFlag Pulumi Component

Pulumi component for managing TinyFlag feature flags as infrastructure-as-code.

## Usage

```typescript
import { TinyFlag } from '@tinyflag/pulumi';

const newCheckout = new TinyFlag('new-checkout', {
  name: 'new-checkout',
  enabled: true,
  description: 'Redesigned checkout flow',
  rollout: 50,
  tags: ['checkout', 'experiment'],
});

const darkMode = new TinyFlag('dark-mode', {
  name: 'dark-mode',
  enabled: false,
  description: 'Dark mode toggle',
  tags: ['ui'],
});
```

## Configuration

| Property    | Type     | Required | Description                      |
|-------------|----------|----------|----------------------------------|
| `name`      | string   | yes      | Flag name (kebab-case)           |
| `enabled`   | boolean  | yes      | Globally enabled                 |
| `description` | string | no       | Human-readable description       |
| `rollout`   | number   | no       | Rollout percentage 0-100         |
| `tags`      | string[] | no       | Categorization tags              |
| `flagsFile` | string   | no       | Path to flags file (default: flags.yml) |
