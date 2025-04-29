# TinyFlag Go SDK

Zero-dependency feature flag evaluator for Go.

Ports the TinyFlag MurmurHash3, rollout bucketing, variant selection, and full
flag evaluation logic to Go, ensuring deterministic results across all
TinyFlag SDK languages.

## Prerequisites

- Go 1.21+

## Installation

```bash
go get github.com/josedab/tinyflag-go/tinyflag
```

## Usage

```go
package main

import (
	"fmt"
	"github.com/josedab/tinyflag-go/tinyflag"
)

func main() {
	tf, err := tinyflag.LoadFile("flags.yml")
	if err != nil {
		panic(err)
	}

	ctx := &tinyflag.UserContext{UserID: "user-123"}
	enabled := tf.IsEnabled("my-flag", ctx)
	fmt.Println("my-flag enabled:", enabled)
}
```

## Building

```bash
go build ./...
```

## Testing

```bash
go test ./...
```

## Cross-language Determinism

All test vectors from `sdks/test-vectors.json` pass identically in Go, Rust,
Python, and TypeScript, ensuring consistent flag evaluation across runtimes.
