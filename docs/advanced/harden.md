# Kernel Hardening with KiwiPanel

## Checking Kernel Hardening Values (sysctl)

KiwiPanel provides a structured and production-safe approach to kernel hardening.  
Instead of directly modifying global system configuration, it applies security settings using a controlled, auditable, and reversible workflow designed for modern Linux servers and cloud environments.

Kernel hardening in KiwiPanel is built around clear principles: isolation of configuration, explicit ownership of changes, safe re-runs, cloud-aware behavior, and easy rollback.  

This ensures kernel security improvements can be applied confidently without risking system stability or long-term maintainability.

On Linux, kernel parameters can be queried safely using the `sysctl` command.  
This is the **recommended and script-friendly** way to audit kernel hardening settings.

### Recommended Method (Preferred)

```bash
sysctl -n net.ipv4.tcp_syncookies
sysctl -n net.ipv4.ip_forward
sysctl -n net.ipv4.conf.all.rp_filter
sysctl -n kernel.randomize_va_space
```
OR 

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
## Kernel Hardening with KiwiPanel

KiwiPanel provides a safe and reversible way to audit and apply kernel hardening settings using `sysctl`. Instead of modifying global system files, KiwiPanel manages its own dedicated configuration and exposes a clear lifecycle: **check → apply → rollback**.

---

### `check` — Audit Current Kernel Settings

```bash
kiwipanel harden kernel check
```


### `apply` — Apply Kernel Hardening (Persistent)

```bash
kiwipanel harden kernel apply
```
The new configuration located at `/etc/sysctl.d/99-kiwipanel-kernel-hardening.conf` is applied and persisted.

### `rollback` — Revert Kernel Hardening Changes

```bash
kiwipanel harden kernel rollback
```
The previous configuration is restored.

### `help` — Display Usage Information

```bash
kiwipanel harden kernel help
```
Displays usage information for the kernel hardening commands.
