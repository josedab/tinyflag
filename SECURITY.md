# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅ Yes    |

## Reporting a Vulnerability

If you discover a security vulnerability in TinyFlag, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email **josedab@users.noreply.github.com** with:

- A description of the vulnerability
- Steps to reproduce the issue
- Any potential impact

You should receive a response within **48 hours**. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Security Model

TinyFlag is designed with a minimal attack surface — there is no server, no database, and no network service to secure. For details on the security model, see [docs/security.md](./docs/security.md).

### Key Points

- **Flag files are trusted** — if you control the file, you control the flags
- **No secrets in flag files** — flag files are designed to be committed to Git
- **URL sources should use HTTPS** — the SDK warns if HTTP is used
- **Header values are never logged** or included in error messages
- **Evaluation methods never throw** — they return safe defaults

## Disclosure Policy

- We will acknowledge receipt of your report within 48 hours
- We will provide an estimated timeline for a fix within 5 business days
- We will notify you when the vulnerability is fixed
- We will credit you in the release notes (unless you prefer to remain anonymous)
