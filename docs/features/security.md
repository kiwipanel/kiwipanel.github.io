## `kiwipanel check` — Full System Audit & Health Report

The `kiwipanel check` command is one of the **core safety features** of KiwiPanel.  
It performs a deep, structured inspection of the server and reports the current
**health, security posture, and runtime readiness** of the system.

This command is intentionally **transparent, read-only by default, and automation-friendly**.

---

## Why `kiwipanel check` Exists

Modern servers fail quietly:

- A firewall is installed but inactive
- SSH is exposed with weak settings
- Disks fill up without warning
- Services stop after reboot
- Permissions drift over time

`kiwipanel check` exists to **surface these problems early**, using **real system state**, not assumptions.

> If something is wrong, you should see it immediately.

---

## Basic Usage

```bash
kiwipanel check
