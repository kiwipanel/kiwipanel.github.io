# KiwiPanel Coding Standards

> **Status:** Canonical
>
> This document defines mandatory coding, security, and operational standards for all KiwiPanel scripts, installers, and system components.

---

## 1. Core Principles

KiwiPanel code MUST be:

1. **Deterministic** – Same input, same result
2. **Non-interactive** – No prompts in production paths
3. **Idempotent** – Safe to re-run multiple times
4. **OS-native** – Follow distro conventions, not personal preference
5. **Transparent** – No hidden behavior, no silent failures
6. **Secure by default** – Least privilege, secrets never exposed

---

## 2. Supported Platforms

All KiwiPanel shell code MUST support:

- Debian (stable)
- Ubuntu LTS
- RHEL / Rocky Linux / AlmaLinux

Unsupported platforms MUST fail fast with a clear error.

---

## 3. Shell Requirements

### 3.1 Interpreter & Safety Flags

All shell scripts MUST start with:

```bash
#!/usr/bin/env bash
set -euo pipefail
```

Do NOT disable these flags.

---

### 3.2 Bash Version

- Target: **bash ≥ 4.2**
- Avoid bashisms that break older enterprise systems

---

## 4. Logging Standards

### 4.1 Mandatory Logging Helpers

Scripts MUST define and use:

- `log_info`
- `log_warn`
- `log_error`
- `log_success`

Rules:
- Every major step MUST log
- Errors MUST be actionable
- No silent failures

---

### 4.2 Log Files

- Global installer log: `/var/log/kiwipanel-install.log`
- Service logs: **OS-native paths only**

Examples:
- Debian/Ubuntu: `/var/log/mysql/error.log`
- RHEL-family: `/var/log/mariadb/mariadb.log`

Never invent custom log locations.

---

## 5. OS & Service Detection

### 5.1 OS Detection

- Use `/etc/os-release`
- Map to logical families (`debian`, `rhel`)
- Fail fast on unsupported OS

---

### 5.2 systemd Rules

- Always run `systemctl daemon-reload` after installs
- Detect service name dynamically (`mariadb` vs `mysql`)
- Never assume service names

---

## 6. Package Management

### 6.1 Repository Policy

- **LTS-only** packages
- Official upstream repositories only
- Third-party repos MUST be justified

### 6.2 Non-interactive Installs

- Debian/Ubuntu: `DEBIAN_FRONTEND=noninteractive`
- RHEL-family: `dnf` preferred, `yum` fallback

---

## 7. Configuration Management

### 7.1 Single Source of Truth

- Policy variables MUST be defined once
- No duplicated defaults
- Generated files MUST be clearly marked

---

### 7.2 File Permissions

Mandatory rules:

- Secrets: `600`
- Config directories: `755`
- Secrets directory: `700`

Never weaken permissions.

---

## 8. Secrets Handling (CRITICAL)

### 8.1 Storage

- All secrets MUST be stored in `/etc/kiwipanel/secrets.env`
- Secrets MUST be shell-escaped

Required format:

```bash
KEY=value
```

Implementation:

```bash
printf '%s=%q\n' "$key" "$value"
```

---

### 8.2 Display Rules (NON-NEGOTIABLE)

❌ NEVER:
- Echo passwords
- Print secrets to terminal
- Log credentials

✅ Allowed:
- Indicate where secrets are stored
- Provide retrieval instructions

---

## 9. Database Standards (MariaDB)

- LTS versions only
- Root remote access disabled
- No anonymous users
- No test database
- Socket authentication preferred

Idempotency is mandatory for:
- Users
- Databases
- Privileges

---

## 10. Portability Rules

### 10.1 Forbidden Commands

Avoid:
- `grep -P` / `grep -oP`
- GNU-only flags when POSIX alternatives exist

Prefer:
- `sed`
- `awk`
- POSIX-compatible tools

---

## 11. Error Handling

- Fail fast on unrecoverable errors
- Retry only when meaningful
- Always show logs on service failures

Never swallow errors with `|| true` unless justified and documented.

---

## 12. Health Checks

Every installer MUST provide:

- Service status check
- Socket connection test
- Version verification
- Disk space sanity check

Health checks MUST fail the installer if critical components are broken.

---

## 13. Output & UX

- Output MUST be readable in SSH
- No emojis in production output
- Clear section separators allowed
- Final summary MUST state success or failure clearly

---

## 14. Versioning & Metadata

Scripts MUST include:

- Name
- Purpose
- Version
- Supported OS
- Policy notes

Semantic versioning is recommended.

---

## 15. What KiwiPanel Code Is NOT

KiwiPanel code is NOT:

- Interactive wizards
- Black-box installers
- Magic scripts
- "Works on my machine" hacks

---

## 16. Enforcement

- Code not following this standard MUST NOT be merged
- Security violations are immediate blockers
- Convenience never overrides correctness

---

**KiwiPanel philosophy:**
> _If it’s not predictable, secure, and debuggable — it doesn’t ship._

