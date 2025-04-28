.PHONY: help build test lint typecheck format clean dev
.PHONY: build-go test-go build-python test-python build-rust test-rust build-jvm test-jvm
.PHONY: doctor validate

.DEFAULT_GOAL := help

## —— JS Packages (pnpm) ——————————————————————————————

build: ## Build all JS packages
	pnpm -r build

test: ## Run all JS package tests
	pnpm -r test

test-watch: ## Watch-mode tests across all JS packages
	pnpm -r --parallel --filter './packages/*' test:watch

lint: ## Type-check all packages and check formatting
	pnpm -r lint && prettier --check .

typecheck: ## Type-check all packages (tsc --noEmit)
	pnpm -r lint

format: ## Auto-format all files with Prettier
	prettier --write .

format-check: ## Check formatting without writing
	prettier --check .

clean: ## Remove dist/ from all packages
	pnpm -r clean

dev: ## Start dev/watch mode for all packages
	pnpm -r --parallel dev

doctor: ## Check dev environment setup
	node scripts/doctor.js

validate: ## Validate example flags file
	node packages/cli/dist/index.js validate examples/flags.yml

## —— Go SDK ———————————————————————————————————————————

build-go: ## Build Go SDK
	cd sdks/go && go build ./...

test-go: ## Test Go SDK
	cd sdks/go && go test ./...

## —— Python SDK ———————————————————————————————————————

build-python: ## Install Python SDK in editable mode
	cd sdks/python && pip install -e .

test-python: ## Run Python SDK tests
	cd sdks/python && python -m pytest tests/

## —— Rust SDK ————————————————————————————————————————

build-rust: ## Build Rust SDK
	cd sdks/rust && cargo build

test-rust: ## Run Rust SDK tests
	cd sdks/rust && cargo test

## —— JVM SDK ————————————————————————————————————————

build-jvm: ## Build JVM SDK
	cd sdks/jvm && ./gradlew build

test-jvm: ## Run JVM SDK tests
	cd sdks/jvm && ./gradlew test

## —— All SDKs ———————————————————————————————————————

build-all: build build-go build-python build-rust build-jvm ## Build everything (JS + all SDKs)

test-all: test test-go test-python test-rust test-jvm ## Test everything (JS + all SDKs)

## —— Help ————————————————————————————————————————————

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
