---
title: Fail2ban Management
description: Protect your server from brute-force attacks with KiwiPanel's built-in Fail2ban management.
---

# Fail2ban Management

## What is Fail2ban?

Fail2ban is an intrusion prevention tool that monitors log files for suspicious activity — such as repeated failed login attempts — and automatically bans the offending IP addresses. KiwiPanel integrates Fail2ban directly into its security dashboard at `/security/fail2ban`, giving you full visibility and control without touching the command line.

## Why You Need It

Every server connected to the internet is constantly targeted by automated bots attempting to brute-force SSH passwords, web application logins, and other services. Without Fail2ban:

::: danger What happens without Fail2ban?
- **Brute-force attacks run unchecked** — bots can try thousands of password combinations per minute against your SSH, FTP, and web services
- **Server resources are wasted** — each failed authentication attempt consumes CPU and memory, degrading performance for legitimate users
- **Successful intrusions become a matter of time** — even strong passwords can eventually be cracked without rate limiting
- **No visibility into attacks** — you won't know how many times your server has been targeted or from which IPs
:::

::: tip Benefits of Fail2ban protection
- **Automatic blocking** — malicious IPs are banned before they can succeed
- **Reduced attack surface** — banned IPs cannot reach your services at all
- **Resource savings** — fewer failed attempts means more resources for real traffic
- **Deterrence** — attackers move on to easier targets when their IPs get banned quickly
:::

## Pre-configured Out of the Box

::: info Zero-configuration security
Fail2ban is **automatically installed and configured** during KiwiPanel setup. The `sshd` jail comes pre-configured, meaning your SSH service is protected from the moment KiwiPanel is installed — no manual setup required.
:::

---

## Dashboard Overview

Navigate to **Security → Fail2ban** (`/security/fail2ban`) to access the management interface.

### Active Jails

The dashboard displays all active jails with real-time statistics:

| Column | Description |
|--------|-------------|
| **Jail Name** | The service being protected (e.g., `sshd`) |
| **Failed Count** | Number of failed authentication attempts detected |
| **Banned Count** | Number of IPs currently banned by this jail |

This gives you an at-a-glance view of how actively your server is being targeted and how effectively Fail2ban is responding.

### Banned IPs

Below the jail overview, a complete list of all **currently banned IPs** is displayed across all jails. For each banned IP, you can see which jail triggered the ban.

#### Unbanning an IP

If a legitimate user or your own IP gets accidentally banned:

1. Find the IP in the banned list
2. Click the **Unban** action next to it
3. The IP is immediately removed from the specified jail's ban list

::: warning
Only unban IPs you trust. If the IP was banned due to genuine failed login attempts from an unauthorized source, unbanning it will allow the attacker to resume their attempts.
:::

---

## Configuring Jail Settings

Each jail can be individually tuned with three key parameters:

| Setting | Description | Default |
|---------|-------------|---------|
| **Max Retries** | Number of failed attempts before an IP is banned | Varies by jail |
| **Ban Duration** | How long a banned IP stays blocked (in seconds) | Varies by jail |
| **Find Time** | The time window in which failed attempts are counted (in seconds) | Varies by jail |

**Example:** With max retries set to **5**, find time set to **600** (10 minutes), and ban duration set to **3600** (1 hour) — an IP that fails authentication 5 times within 10 minutes will be banned for 1 hour.

::: tip Tuning recommendations
- For **SSH**: keep max retries low (3–5) and ban duration high (1–24 hours). SSH brute-force is extremely common.
- **Shorter find times** catch rapid automated attacks. **Longer find times** catch slower, distributed attacks.
- If you manage your server from a fixed IP, consider whitelisting it to avoid locking yourself out.
:::

---

## Relationship with Audit Log

KiwiPanel's security features work together:

- **Audit Log** (`/security/audit`) — records security-relevant events on your server: who logged in, what changed, what failed
- **Fail2ban** (`/security/fail2ban`) — takes automated action based on patterns in those events

Think of the Audit Log as your **security camera** and Fail2ban as your **security guard**. The Audit Log shows you what happened; Fail2ban prevents it from happening again.

::: tip
When investigating a banned IP, check the Audit Log at `/security/audit` for the specific failed login attempts that triggered the ban. This gives you full context on the attack timeline.
:::
