# Development Progress

KiwiPanel's roadmap and implementation status. Progress is tracked against actual code — items are only marked complete when the feature is merged and tested.

::: tip Current Phase
**Phase 3 — Core Reliability & Operations** is actively in progress. Phases 0–2 are complete.
:::

## Overview

| Phase | Status | Completed | Remaining |
|-------|--------|-----------|-----------|
| Phase 0 — Foundation | ✅ Complete | 10/10 | 0 |
| Phase 1 — Core Panel Features | ✅ Complete | 17/17 | 0 |
| Phase 2 — Security & Hardening | ✅ Complete | 25/25 | 0 |
| Phase 3 — Core Reliability & Operations | 🟡 In Progress | 13/18 | 5 |
| Phase 4 — Security Hardening & Isolation | ⬜ Planned | 0/6 | 6 |
| Phase 5 — Migration & Growth | ⬜ Planned | 0/4 | 4 |
| Phase 6 — Premium & Ecosystem | ⬜ Planned | 0/7 | 7 |

---

## Phase 0 — Foundation (Pre-Alpha) {#phase-0}

**Goal:** Establish a clean, inspectable core with minimal abstraction.

**Status:** ✅ COMPLETE

- [x] Installer bootstrap for supported Linux distributions
- [x] Go-based modular backend architecture with clean separation of concerns
- [x] CLI framework (`kiwipanel`) with comprehensive system-level operations
- [x] SQLite-based local state with SQLC for type-safe operations
- [x] Thorough system inspection (CPU, memory, disk, OS…) with `kiwipanel check`
- [x] OpenLiteSpeed + MariaDB + PHP stack provisioning
- [x] Clear separation between panel logic and system tooling
- [x] Internal logging and structured error handling
- [x] Kernel hardening via `kiwipanel harden kernel` with {check, apply, rollback}
- [x] Agent system for privileged operations with proper isolation

---

## Phase 1 — Core Panel Features (Alpha) {#phase-1}

**Goal:** Make KiwiPanel usable for real servers with limited scope.

**Status:** ✅ COMPLETE

### Authentication & Dashboard

- [x] Web UI authentication with session management and role-based access control
- [x] Live dashboard with real-time VPS performance metrics
- [x] Demo mode (read-only admin account for showcasing)
- [x] Web-based self-update functionality

### Service Management

- [x] Agent system for privileged operations with separate binary
- [x] Service management (start/stop/reload) — OpenLiteSpeed, MariaDB, PHP
- [x] Rescuing and diagnosing tool (`kiwi` CLI using bash)

### User Management

- [x] User management with isolated accounts, permissions, levels, and roles
  - Auto-generated credentials for new client users (`crypto/rand`, 16+ char passwords)
  - Client home directory creation with per-user UID (10000+)
  - PAM limits enforcement per user
  - System user verification (DB↔OS sync with orphan detection)

### Website Management

- [x] Full website management:
  - Three site types: PHP, Reverse Proxy, Static (immutable at creation time)
  - Virtual host creation with auto-generated per-site Linux user (`{owner}_{4-hex}`)
  - Client home directory + UID/GID collision resilience (agent retry + panel DB sync)
  - Confirmation page with directory structure preview
  - Document root configuration
  - PHP version selection (8.2, 8.3, 8.4, 8.5)
  - Website suspension/activation
  - Domain configuration
  - Site-type guards (defense-in-depth: incompatible features return 404)
  - Website permission verification with fix commands

::: details Directory structure for website creation
```
/home/client_{ownerID}/
├── {owner}_{4hex}/              ← auto-generated Linux user
│   └── {domain_sanitized}/      ← from primary domain
│       ├── public_html/         ← document root
│       ├── logs/
│       ├── tmp/
│       ├── ssl/
│       └── backups/
└── {owner}_{4hex}/              ← another website for same client
    └── {another_domain}/
        └── public_html/
```
:::

### File Manager & Terminal

- [x] File manager with Ace Editor, upload (tus protocol), download, compress/decompress, chmod, search, trash
- [x] Per-website jailed terminal with systemd sandbox and Linux user isolation
- [x] Safe defaults for permissions and filesystem layout with per-website Linux users
- [x] Non-destructive config generation (no silent overwrites)

### PHP & SSL

- [x] PHP version per site with suEXEC + lsphp pools
- [x] SSL/TLS management:
  - Free Let's Encrypt certificates (automated issuance + renewal)
  - ZeroSSL and Buypass certificate providers
  - Custom certificate upload
  - Certificate removal and renewal
  - Force HTTPS toggle
  - OLS virtual host SSL configuration

### Database, Logs & Other

- [x] Database management (create/delete users & databases)
- [x] Comprehensive log viewer (OLS, MariaDB, system, website access/error logs with statistics)
- [x] Plans & quotas system with enforcement (websites, domains, databases, disk, feature toggles)

---

## Phase 2 — Security & Hardening {#phase-2}

**Goal:** Secure-by-default without hiding the system.

**Status:** ✅ COMPLETE

### Firewall & SSH

- [x] Security audit via `kiwipanel check` command
- [x] Firewall management (UFW for Debian family, firewalld for RHEL family) with preview + auto-rollback
- [x] SSH key management
- [x] SSH hardening (port change, password auth toggle, authorized key management) with rollback timer
- [x] Fail2ban integration with jail management and banned IP overview

### Terminal Sandboxing

- [x] Website terminal sandboxing (5-layer defense-in-depth):

| Layer | Protection |
|-------|-----------|
| systemd sandbox | `ProtectSystem=strict`, `ProtectHome=tmpfs`, `PrivateTmp`, `NoNewPrivileges`, `MemoryMax=256M`, `CPUQuota=50%`, `TasksMax=50` |
| PID namespace | `PrivatePIDs=yes` on systemd v256+ |
| Command guard | 35+ regex patterns blocking destructive commands |
| PATH restriction | 89 allowed commands, shells excluded |
| Bash rcfile | `cd` override, DEBUG trap, readonly environment |
| PAM limits | `nproc=50`, `nofile=1024` per user |
| UID/GID isolation | Per-website Linux user, uid ≥ 10000 |

### Website Settings

- [x] General settings (website name, status toggle)
- [x] Security settings (directory listing, hotlink protection)
- [x] Static content settings (gzip compression, cache expiry)
- [x] Resource limits (max connections, timeout)
- [x] Index files configuration
- [x] HTTP Authorization (htpasswd-style directory protection CRUD)
- [x] URL Redirects management (301/302 rules CRUD)
- [x] Danger zone (suspend/unsuspend, delete)

### PHP Security

- [x] Per-website `open_basedir`, `disable_functions` presets
- [x] Global PHP security defaults (`expose_php`, `allow_url_include`, session hardening)
- [x] Admin-configurable PHP option allowlist
- [x] PHP config audit trail with before/after snapshots
- [x] PHP suEXEC & chroot filesystem jail (kernel-level isolation)
  - `chrootPath` + `chrootMode 2` in vhost templates
  - Chroot jail setup (`dev/`, `etc/`, `tmp/` directories)
  - suEXEC verification agent endpoint
  - Global toggle in Settings → PHP Security

### System Management

- [x] TLS management (Let's Encrypt + ZeroSSL + Buypass automation)
- [x] System/OS settings (hostname, timezone, swap management, system updates)
- [x] Process viewer with kill capability and blocklist protection
- [x] Open ports viewer (TCP/UDP) with auto-refresh
- [x] Per-mount and per-user disk usage breakdown with threshold warnings
- [x] OS-level security audit log (SSH/sudo/auth events from journalctl)
- [x] Scheduled reboot with systemd timers (immediate or scheduled)
- [x] NTP time synchronization status and server configuration
- [x] DNS resolver configuration with Cloudflare/Google/Quad9 presets
- [x] System-wide cron job viewer with human-readable schedules
- [x] Sysctl kernel parameter tuning with presets

---

## Phase 3 — Core Reliability & Operations {#phase-3}

**Goal:** Make KiwiPanel production-trustworthy with automated recovery, consistent backups, and resource enforcement.

**Status:** 🟡 IN PROGRESS

### Completed ✅

#### Self-Healing & Watchdog

- [x] Idempotent installer with step runner, verify-before-skip, and resume support (tested on Ubuntu 22/24, Debian 12/13, AlmaLinux 9/10, Rocky 9)
- [x] Self-healing systemd drop-in overrides for critical services (lsws, mariadb, redis) — automatic crash recovery even when panel/agent are down
- [x] Service watchdog via systemd DBus subscription with circuit breaker and auto-heal
- [x] lsphp worker health monitoring via `/proc` scanning (reliable identification regardless of `argv[0]`)

::: info Two-layer self-healing
**Layer 0 (systemd)** handles process crashes via restart policies — works even when the panel is down. **Layer 1 (watchdog)** handles "running but unresponsive" services and PHP-specific conditions. The layers are complementary by design and never conflict.
:::

#### Backups & Integrity

- [x] Local backups with scoped modes (full/files/database), SHA256 verification, exclude patterns, staging-based restore, background mode with callback
- [x] Website permission verification — ownership and mode checks with auto-generated fix commands
- [x] System user verification — DB↔OS reconciliation, orphan detection, missing-on-OS detection

#### VHConf & Reverse Proxy

- [x] VHConf template system — golden-file tested templates for PHP, Proxy, and Static site types with SafeWrite pipeline, snapshot, audit, and marker-block management
- [x] Reverse proxy management — per-path rules with SSRF protection, DNS-rebinding mitigation (resolved IP persistence), health checks, websocket support, custom headers, connect/read timeouts, retry-on-5xx
- [x] Whole-site proxy type — dedicated proxy vhconf template with configurable backend, custom request headers, forwarding options

::: details Reverse proxy security features
| Feature | Description |
|---------|-------------|
| SSRF protection | Backend URLs validated against private/loopback ranges |
| DNS-rebinding mitigation | Resolved IP persisted at creation; re-verified at apply time |
| Health checks | Configurable health check path with last-check tracking |
| Websocket | Per-rule websocket upgrade toggle |
| Custom headers | Up to 32 headers with reserved-name enforcement |
:::

#### Rewrite Rules & .htaccess

- [x] Rewrite rules engine — mod_rewrite CRUD with plan-gating, regex validation, flag allowlists, conditional chains (RewriteCond), drag-and-drop ordering, vhconf marker-block rendering
- [x] .htaccess compatibility checker — 60+ Apache directives scored (full/partial/none/ignored) against OLS, per-file analysis, summary statistics
- [x] .htaccess → rewrite-rules converter — automatic translation with preview/apply workflow, selective import, per-conversion audit trail

::: details .htaccess compatibility scores
| Score | Meaning |
|-------|---------|
| **Full** | OLS implements the directive identically to Apache |
| **Partial** | OLS implements it with caveats (some argument forms differ) |
| **None** | OLS ignores or errors on the directive |
| **Ignored** | Apache-only directive, harmless on OLS (e.g. `AllowOverride`) |
:::

#### CLI Improvements

- [x] CLI password reset — smart handling of 0/1/multiple admin scenarios (creates admin if none exists, resets deterministically by level+ID)

### Remaining ⬜

- [ ] Agent protocol hardening — strict typed RPC, no generic command execution
- [ ] Disk + resource limit enforcement via Linux quotas (`setquota`/`repquota`)
- [ ] Full domain management (DNS zones, subdomains, aliases, SSL auto-provisioning)
- [ ] Scriptable actions with JSON/stdout-friendly output
- [ ] Filesystem quotas implementation

---

## Phase 4 — Security Hardening & Isolation {#phase-4}

**Goal:** Harden multi-tenant isolation and detect configuration anomalies.

**Status:** ⬜ PLANNED

- [ ] SELinux/AppArmor compatibility
- [ ] Config drift detection with normalized hashing and ownership model
- [ ] CageFS Tier 1 (systemd-native per-user filesystem isolation)
- [ ] WAF integration (Coraza for panel, OLS ModSecurity for hosted sites)
- [ ] Automated security scanning (ClamAV, malware detection)
- [ ] Explicit warnings for unsafe configurations

---

## Phase 5 — Migration & Growth {#phase-5}

**Goal:** Unlock new users by making KiwiPanel the obvious migration target.

**Status:** ⬜ PLANNED

- [ ] DirectAdmin migration adapter with pre-flight compatibility analysis
- [ ] Migration framework with `MigrationSource` interface and dry-run mode
- [ ] Per-site traffic accounting via streaming log aggregation
- [ ] CLI + API polish (JSON API layer, OpenAPI spec, scripting support)

---

## Phase 6 — Premium & Ecosystem {#phase-6}

**Goal:** Features that justify paid tiers and grow the ecosystem.

**Status:** ⬜ PLANNED

- [ ] Remote backups (S3, B2, SFTP) — builds on local backup infrastructure
- [ ] Rootless Docker addon with per-user containers
- [ ] Performance tuning suite (jemalloc, OPcache presets, MariaDB auto-tuning)
- [ ] One-click app installer (WordPress, Laravel, Node.js)
- [ ] Observability timeline (unified event view across all features)
- [ ] External monitoring integration (Prometheus-compatible metrics)
- [ ] Webhook notifications (Slack, Discord, email on events)

---

## Supported Operating Systems

KiwiPanel supports non-EOL Linux distributions with **systemd 249+**, officially supported by OpenLiteSpeed.

| Distribution | Versions |
|-------------|----------|
| Debian | 12, 13 |
| Ubuntu LTS | 22.04, 24.04 |
| Rocky Linux | 9, 10 |
| AlmaLinux | 9, 10 |
| RHEL | 9 and compatible derivatives |

::: warning Not Supported
Debian 11, AlmaLinux 8, Rocky Linux 8, and RHEL 8 are **not supported** — they ship with systemd < 249 which lacks required security features for terminal sandboxing. CentOS Stream and EOL distributions are not supported.
:::

---

## Technical Stack

| Component | Technology |
|-----------|-----------|
| Language | Go 1.25 |
| Database | SQLite with SQLC |
| Web Server | OpenLiteSpeed |
| PHP | 8.2, 8.3, 8.4, 8.5 (suEXEC + lsphp) |
| Database Server | MariaDB |
| HTTP Router | chi v5 |
| SSL/ACME | lego v4 (Let's Encrypt, ZeroSSL, Buypass) |
| File Upload | tus protocol |
| Sessions | alexedwards/scs v2 |
| CLI | cobra |
