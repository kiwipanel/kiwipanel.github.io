# Firewall

## Firewall Management

KiwiPanel provides **basic, transparent firewall setup** to help secure your server without hiding or abstracting system behavior.

Firewall configuration is **opt-in**, **non-destructive**, and always uses **native Linux firewall tools**.

---

### Supported Firewalls

KiwiPanel automatically detects the operating system family and uses the appropriate firewall:

- **Debian / Ubuntu** → `ufw`
- **Rocky / Alma / RHEL** → `firewalld`

No custom firewall layer is introduced.

---

### Design Principles

KiwiPanel firewall handling follows these rules:

- Uses **standard system tools only**
- Makes **explicit rule changes**
- Does **not overwrite existing rules silently**
- Avoids background agents or custom daemons
- Leaves the firewall **fully manageable outside KiwiPanel**

You can always inspect, modify, or disable the firewall manually.

---

### Default Behavior

When firewall setup is enabled, KiwiPanel:

- Enables the system firewall if not already active
- Allows **SSH access** (port 22 by default)
- Allows **HTTP / HTTPS** traffic:
  - Port `80` (HTTP)
  - Port `443` (HTTPS)
- Allows **KiwiPanel access**:
  - Port `8443`
- Denies all other incoming traffic by default

No outbound traffic is restricted.

---

### Cloud Provider Notice

Some cloud providers require ports to be opened **outside the server**, for example:

- Amazon Lightsail
- Oracle Cloud
- Other managed VPS platforms

Even if the firewall allows a port, traffic may still be blocked at the provider level.

---

### Non-Goals

KiwiPanel **does not**:

- Implement its own firewall engine
- Automatically close ports without user awareness
- Modify existing complex firewall rules
- Attempt to manage advanced firewall scenarios (VPNs, custom routing)

Advanced setups are intentionally left to the administrator.

---

### Visibility & Control

All firewall actions performed by KiwiPanel:

- Are logged
- Can be reviewed
- Can be reverted manually
- Do not prevent direct usage of `ufw` or `firewall-cmd`

KiwiPanel assists with **safe defaults**, not enforcement.

---

### Future Plans

Planned improvements include:

- Firewall status overview in the Web UI
- Explicit port visibility per service
- Warnings for exposed or unsafe ports
- Integration with security audit checks
- Optional Fail2ban / CrowdSec coordination

---

### Summary

KiwiPanel treats the firewall as a **first-class system component**, not a black box.

The goal is simple:

> Secure the server by default, without taking control away from the user.
