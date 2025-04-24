# TinyFlag Terraform Provider

Terraform provider for managing TinyFlag feature flag files as infrastructure-as-code.

## Usage

```hcl
terraform {
  required_providers {
    tinyflag = {
      source  = "josedab/tinyflag"
      version = "~> 0.1"
    }
  }
}

provider "tinyflag" {
  flags_file = "./flags.yml"
}

resource "tinyflag_flag" "new_checkout" {
  name        = "new-checkout"
  enabled     = true
  description = "Redesigned checkout flow"
  rollout     = 50
  tags        = ["checkout", "experiment"]
}

resource "tinyflag_flag" "dark_mode" {
  name        = "dark-mode"
  enabled     = false
  description = "Dark mode toggle"
  tags        = ["ui"]
}
```

## Building

```bash
go build -o terraform-provider-tinyflag
```

## Resources

### `tinyflag_flag`

| Attribute     | Type    | Required | Description                       |
| ------------- | ------- | -------- | --------------------------------- |
| `name`        | string  | yes      | Flag name (kebab-case)            |
| `enabled`     | bool    | no       | Globally enabled (default: false) |
| `description` | string  | no       | Human-readable description        |
| `rollout`     | integer | no       | Rollout percentage 0-100          |
| `tags`        | list    | no       | Categorization tags               |
