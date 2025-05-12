# TinyFlag Kubernetes Operator

GitOps-native Kubernetes operator that syncs feature flag configurations from Git repositories into ConfigMaps.

## Features

- **Custom Resource Definition (FlagConfig)** — Declarative flag configuration management
- **Git → ConfigMap Sync** — Watches Git repos and syncs flag files into ConfigMaps
- **Multi-namespace Support** — Replicate ConfigMaps across multiple namespaces
- **Sidecar Container** — Lightweight HTTP endpoint exposing flags via `localhost:8080/flags`
- **Helm Chart** — Easy installation with configurable values
- **Argo CD Compatible** — Works with GitOps workflows

## Installation

### Helm

```bash
helm install tinyflag-operator ./helm/tinyflag-operator
```

### kubectl

```bash
kubectl apply -f config/crd/flagconfig.yaml
kubectl apply -f config/manager/
```

## Usage

Create a `FlagConfig` resource:

```yaml
apiVersion: tinyflag.io/v1alpha1
kind: FlagConfig
metadata:
  name: my-flags
spec:
  source:
    gitRepo: https://github.com/myorg/feature-flags.git
    branch: main
    path: flags.yml
    pollInterval: 60s
  configMap:
    name: app-flags
    key: flags.yml
  namespaces:
    - production
    - staging
  sidecar:
    enabled: true
    port: 8080
```

## Sidecar

The sidecar container provides a local HTTP endpoint for flag evaluation:

```bash
# From within the pod
curl localhost:8080/flags    # Get flag configuration
curl localhost:8080/health   # Health check
curl localhost:8080/ready    # Readiness check
```

## Architecture

```
Git Repo → [Operator Controller] → ConfigMap → [Sidecar] → localhost:8080/flags
                                       ↓
                                  [Application Pod]
```
