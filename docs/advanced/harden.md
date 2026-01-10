# Kernel Hardening with KiwiPanel

KiwiPanel provides a structured and production-safe approach to managing kernel security settings on Linux systems.  
Rather than directly modifying global system files, KiwiPanel applies a controlled baseline using a dedicated configuration file and a clear lifecycle: **check → apply → rollback**.

This approach focuses on **enforcing safe defaults and preventing configuration drift**, while remaining compatible with modern Linux distributions and cloud-based VPS environments.

Kernel hardening in KiwiPanel follows these principles:

- **Isolation**: Never modifies `/etc/sysctl.conf`
- **Ownership**: All changes are clearly attributed to KiwiPanel
- **Idempotency**: Commands can be safely re-run
- **Cloud-aware**: Does not force provider-controlled interface settings
- **Reversible**: One-command rollback

This ensures kernel security settings can be managed confidently without risking system stability or long-term maintainability.

---

## Checking Kernel Hardening Values (sysctl)

On Linux, kernel parameters can be queried safely using the `sysctl` command.  
This is the **recommended and script-friendly** method for auditing kernel hardening settings.

### Recommended Method (Preferred)

```bash
sysctl -n net.ipv4.tcp_syncookies
sysctl -n net.ipv4.ip_forward
sysctl -n net.ipv4.conf.all.rp_filter
sysctl -n kernel.randomize_va_space
```
Expected output:

```bash
1
0
1
2
```

## Simple Bash Audit Script 

```bash
#!/usr/bin/env bash

declare -A expected=(
  ["net.ipv4.tcp_syncookies"]="1"
  ["net.ipv4.ip_forward"]="0"
  ["net.ipv4.conf.all.rp_filter"]="1"
  ["kernel.randomize_va_space"]="2"
)

for key in "${!expected[@]}"; do
  if ! cur=$(sysctl -n "$key" 2>/dev/null); then
    echo "[SKIP] $key not supported"
    continue
  fi

  if [[ "$cur" == "${expected[$key]}" ]]; then
    echo "[OK]   $key = $cur"
  else
    echo "[WARN] $key = $cur (expected ${expected[$key]})"
  fi
done

```
## Kernel Hardening Commands

KiwiPanel manages kernel hardening through a clear and reversible command set.

---

### `check` — Audit Current Kernel Settings

Audits current kernel parameters against KiwiPanel’s baseline profile and reports any deviations.
No changes are made to the system.

```bash
kiwipanel harden kernel check
```

### `apply` — Apply Kernel Hardening (Persistent)

```bash
kiwipanel harden kernel apply
```
Kernel parameters are reloaded automatically, and the system is re-checked after applying. The new configuration located at `/etc/sysctl.d/99-kiwipanel-kernel-hardening.conf` is applied and persisted. If values already match the baseline, output may appear unchanged. The primary effect of apply is persistence and ownership, not immediate value changes

### `rollback` — Revert Kernel Hardening Changes

```bash
kiwipanel harden kernel rollback
```
The previous configuration is restored. Removes the KiwiPanel-managed kernel hardening configuration and reloads system defaults.
Only settings applied by KiwiPanel are reverted.

### `help` — Display Usage Information

```bash
kiwipanel harden kernel help
```
Displays usage information for the kernel hardening commands.
