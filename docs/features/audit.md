# Security Audit Log

## Overview

The Security Audit Log gives you real-time visibility into who is accessing your server and what they are doing with elevated privileges. It monitors SSH logins, failed authentication attempts, and sudo command executions — all from a single dashboard.

## Why It Matters

Without an audit log, you are flying blind. Consider these scenarios:

- **An attacker brute-forces SSH credentials overnight.** Without the audit log, you would never know hundreds of failed login attempts occurred until something breaks. With it, you see the spike in failed attempts immediately and can take action — block the IP, disable password auth, or tighten firewall rules.

- **A team member runs a destructive sudo command.** Without the audit log, there is no record of who did what. With it, every sudo execution is captured with the exact command, timestamp, and username.

- **An unauthorized SSH key is used to log in.** Without the audit log, a compromised key goes unnoticed. With it, you see the login event, the source IP, and the authentication method — making it easy to spot access from unexpected locations.

**In short:** if you don't have audit logging, you cannot detect intrusions, investigate incidents, or hold anyone accountable for changes made on your server.

## What It Tracks

| Event Type | What It Captures |
|------------|-----------------|
| **SSH Logins** | Successful logins with username, source IP, and auth method (password or key) |
| **Failed Logins** | Failed SSH authentication attempts with username and source IP |
| **Sudo Commands** | Every command run with sudo, including the full command and the user who ran it |
| **Auth Events** | System-level session creation and authentication events |

Each entry includes: timestamp, event type, username, source IP (when applicable), detailed message, and success/failure status.

## Features

### Live Dashboard

The audit log displays a summary at the top showing total events, failed attempts, and successful events at a glance. Failed events are highlighted in red so they stand out immediately.

### Filtering

You can narrow down the log using:

- **Event type** — View only SSH events, sudo events, or auth events
- **Time range** — Focus on the last hour, 6 hours, 24 hours, 7 days, or 30 days
- **Username** — Search for activity by a specific user

### Auto-Refresh

Enable auto-refresh to keep the dashboard updating in real time — useful for monitoring an active incident or watching for suspicious activity as it happens.

## Use Cases

- **Incident response**: When something goes wrong, the audit log is the first place to look. Filter by time range to reconstruct exactly what happened.
- **Compliance**: Many security standards require logging of authentication events and privileged access. The audit log provides this out of the box.
- **Team accountability**: On shared servers, knowing who ran what sudo command eliminates guesswork and finger-pointing.
- **Intrusion detection**: A sudden burst of failed SSH attempts from an unfamiliar IP is an early warning sign. The audit log makes this visible without needing to manually parse system logs.

## What Happens Without It

Without centralized audit logging, server administrators must:

1. Manually SSH into the server and read raw journalctl/syslog output
2. Parse unstructured log lines to find relevant events
3. Correlate timestamps and usernames across multiple log files
4. Hope that logs haven't been rotated or tampered with

This is slow, error-prone, and impractical during an active security incident when speed matters most. The audit log eliminates this friction by collecting, parsing, and presenting security events in a clean, filterable interface.
