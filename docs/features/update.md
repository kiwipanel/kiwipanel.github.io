# Update

By default, KiwiPanel does not update automatically. You must log in to the web panel to check whether a new version is available and explicitly decide whether to apply the update.

## 1. Purpose

This document defines the official, supported update mechanism for KiwiPanel.

The goals of the update system are:

- Secure self-update without privilege escalation
- Strict separation of concerns between web and root contexts
- Atomic binary replacement with rollback guarantees
- Deterministic state reporting for UI and automation
- Compatibility with systemd-managed Linux systems

Any change to this specification **MUST** be backward-compatible or require a specification version bump.

---

## 2. Design Principles

KiwiPanel updates follow these principles:

### Least Privilege
- Web processes never run as root
- Root operations are isolated and explicit

### Atomicity
- Updates either fully succeed or are fully rolled back
- No partial or inconsistent states are allowed

### Immutability
- The running binary is replaced, never modified in place
- All staging happens outside the live execution path

### Recoverability
- The previous binary is preserved until success is confirmed
- Rollback is automatic on failure

### Observability
- All update states are externally visible
- Errors are machine-readable and timestamped

---

## 3. High-Level Architecture


---

## 4. Privilege Model

### 4.1 Web Panel (Non-Root)

**Runs as:** `kiwipanel:kiwisecure`

**Responsibilities:**
- Download update artifacts
- Write staging files
- Report update status

**MUST NOT:**
- Replace binaries
- Control systemd services
- Write outside the update directory

---

### 4.2 Update Apply (Root)

**Runs as:** `root`

**Invoked via:**
- systemd service, or
- CLI command:  
  `kiwipanel panel update apply`

**Responsibilities:**
- Validate staged updates
- Replace the production binary
- Control systemd services
- Perform rollback when required

---

## 5. Filesystem Layout (Authoritative)

### 5.1 Binary Locations

| Path | Purpose |
|-----|--------|
| `/opt/kiwipanel/bin/kiwipanel` | Active production binary |
| `/opt/kiwipanel/bin/kiwipanel.bak` | Backup binary |
| `/usr/local/bin/kiwipanel` | Root-owned wrapper |

---

### 5.2 Update Directory

**Ownership:**
- User: `kiwipanel`
- Group: `kiwisecure`

**Permissions:**
- Directories: `0750`
- Files: `0640`

---

## 6. Update Trigger (systemd)

### 6.1 Path Unit

```ini
# /etc/systemd/system/kiwipanel-update.path
[Path]
PathExists=/var/lib/kiwipanel/update/staged

[Install]
WantedBy=multi-user.target

```
6.2 Service Unit

The update service is triggered automatically when the staged file appears.

7. Update State Machine

The update process follows a strict linear state model:

STAGED
  ↓
VALIDATING
  ↓
VERIFYING
  ↓
STOPPING
  ↓
INSTALLING
  ↓
STARTING
  ↓
HEALTHY
  ↓
FINALIZING
  ↓
DONE


If any step fails:

State transitions to ERROR

Rollback is attempted immediately

8. Validation & Verification
8.1 Binary Validation

The staged binary MUST:

Be executable

Not be a symlink

Contain valid ELF magic bytes (0x7F 45 4C 46)

8.2 Integrity Verification

A SHA-256 checksum is computed for the staged binary

The checksum MUST match the value in staged.json


A checksum mismatch MUST abort the update.

9. Locking & Concurrency

A file lock (apply.lock) is acquired before applying updates

Only one update may run at a time

Concurrent attempts MUST fail immediately

10. Installation & Rollback
10.1 Install Procedure

Stop kiwipanel.service

Rename current binary to .bak

Rename kiwipanel.new to the production path

Apply ownership and permissions

Start kiwipanel.service

10.2 Rollback Conditions

Rollback occurs if:

The service fails to start

The health check fails

Any post-install step errors

Rollback procedure:

Restore the .bak binary

Restart the service

11. Health Check

After restart, the service MUST:

Report systemctl is-active = active

Accept TCP connections on localhost:8443

Timeout: 30 seconds
Failure triggers rollback.

12. Status Reporting
12.1 Status File Format
{
  "state": "installing",
  "message": "Installing new binary",
  "error": "",
  "time": "2026-01-14T07:48:13Z"
}

12.2 State Semantics
State	Meaning
staged	Update detected
validating	Binary format checks
verifying	Integrity checks
installing	Binary replacement
finalizing	Cleanup
done	Success
error	Failure (rollback attempted)
13. Wrapper Contract

/usr/local/bin/kiwipanel:

Is root-owned

Verifies:

Binary existence

Permissions

Ownership

Non-symlink status

Delegates execution to /opt/kiwipanel/bin/kiwipanel

This wrapper is mandatory and part of the security model.

14. Compatibility Guarantees

Update directory paths are stable

Status file schema is stable

Update trigger mechanism is stable

Breaking changes require a new specification version.
