# Roadmap

This roadmap outlines the planned direction of KiwiPanel.  
Timelines may change based on stability, real-world usage, and community feedback.

---

### Phase 0 — Foundation (Pre-Alpha) ✅

**Goal:** Build a clean, inspectable core with minimal abstraction.

- [x] Installer bootstrap for supported Linux distributions
- [x] Go-based backend architecture
- [x] CLI framework (`kiwipanel`)
- [x] SQLite-based local state
- [x] System inspection (`kiwipanel check`)
- [x] OpenLiteSpeed + MariaDB + PHP provisioning
- [x] Clear separation between panel logic and system tooling
- [x] Structured logging and error handling

---

### Phase 1 — PHP & Stack Flexibility (Alpha)

**Goal:** Support multiple PHP versions and improve stack flexibility.

- [ ] Install and manage **multiple PHP versions**
- [ ] Per-site PHP version selection
- [ ] PHP-FPM pool management
- [ ] Safe switching between PHP versions
- [ ] PHP configuration templates (php.ini, extensions)
- [ ] CLI and Web UI parity for PHP management
- [ ] Clear conflict detection between PHP runtimes

---

### Phase 2 — Web Server Choice (Beta)

**Goal:** Allow users to choose their preferred web server without lock-in.

- [ ] **Nginx** support (PHP-FPM)
- [ ] **Apache** support (MPM + PHP-FPM)
- [ ] Web server selection at install time
- [ ] Safe migration between web servers (manual, explicit)
- [ ] Per-site virtual host management
- [ ] TLS integration across all supported web servers
- [ ] Log viewing for all web servers

---

### Phase 3 — Database Engine Expansion (Beta)

**Goal:** Support multiple database engines with the same transparent approach.

- [ ] **MySQL** support (Oracle MySQL)
- [ ] **PostgreSQL** support
- [ ] Database engine selection at install time
- [ ] Per-site database assignment
- [ ] User and permission management per engine
- [ ] Backup and restore per database engine
- [ ] Clear visibility into database configs and paths

---

### Phase 4 — Production Readiness & Safety (RC)

**Goal:** Make KiwiPanel safe and predictable for long-running servers.

- [ ] Non-destructive configuration validation
- [ ] Pre-change checks and warnings
- [ ] Configuration diff preview before applying changes
- [ ] Rollback for failed operations
- [ ] Versioned config snapshots
- [ ] Read-only / audit mode
- [ ] Upgrade safety checks

---

### Phase 5 — Developer & Ops Experience

**Goal:** Improve daily workflows for developers and sysadmins.

- [ ] Full CLI ↔ Web UI parity
- [ ] Scriptable output (JSON, machine-readable)
- [ ] Environment diagnostics and health checks
- [ ] Resource limits per site (CPU / RAM)
- [ ] Filesystem quotas
- [ ] Backup scheduling and retention policies
- [ ] Borg backup

---

### Phase 6 — Extensibility & Ecosystem

**Goal:** Grow the ecosystem without becoming bloated.

- [ ] Plugin / module system (sandboxed)
- [ ] Hook system for install and lifecycle events
- [ ] External monitoring integration (Prometheus-compatible)
- [ ] WordPress Toolkit
- [ ] Optional notification channels (Telegram, email)
- [ ] Remote backup targets (object storage, S3-compatible)

---

### Explicit Design Rules

To keep KiwiPanel focused, the following rules apply:

- No forced stacks or vendors
- No hidden background services
- No silent configuration changes
- No proprietary formats
- No one-click actions without visibility

---

### Philosophy Going Forward

KiwiPanel prioritizes:

- **Predictability over convenience**
- **Visibility over abstraction**
- **Standard Linux tools over custom orchestration**

If a feature cannot be explained clearly or mapped directly to system behavior, it does not belong in KiwiPanel.
