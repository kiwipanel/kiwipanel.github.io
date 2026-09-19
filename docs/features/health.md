# KiwiPanel Health Check System

**Last Updated:** 2026-09-19  
**Status:** Production-Ready

---

## Overview

KiwiPanel includes a comprehensive health monitoring system that validates system configuration, service status, security posture, and privilege boundaries in real-time. The health dashboard provides administrators with immediate visibility into potential issues before they impact operations.

## Key Features

- **Real-time streaming checks** — Progressive results as each validation completes
- **Security boundary validation** — Runtime verification of privilege isolation
- **Categorized reporting** — Results grouped by system, services, network, security, and KiwiPanel-specific checks
- **Auto-fix capability** — Automated remediation for common configuration issues
- **RESTful API** — Programmatic access for monitoring integrations

## Access Points

### Web Dashboard

Navigate to **Dashboard → Health** or directly access:
```
https://YOUR_PANEL_DOMAIN:8443/dashboard/health
```

### CLI

```bash
# Full health report
kiwipanel check

# JSON output for scripting
kiwipanel check --json

# Auto-fix mode (repairs common issues)
kiwipanel check --fix
```

### API Endpoints

**Full authenticated check:**
```bash
curl -X GET https://YOUR_PANEL_DOMAIN:8443/api/health \
  -H "Cookie: session=YOUR_SESSION" \
  -k
```

**Public status (unauthenticated, sanitized):**
```bash
curl -X GET https://YOUR_PANEL_DOMAIN:8443/api/status
```

Returns category-level pass/fail counts only — no detailed system information exposed.

---

## Check Categories

### System

Core system health and resource utilization:

- **binary** — KiwiPanel executable location and PATH availability
- **config** — Configuration file existence and TOML validity
- **system:public_ip** — External IP address detection
- **system:cpu_model** — CPU identification
- **system:load_average** — 1m, 5m, 15m load averages
- **system:uptime_since** — System boot time
- **system:disk_usage** — Filesystem usage for `/`, `/var`, `/opt`, `/home` (warns at 70%, critical at 85%)
- **system:memory_usage** — RAM utilization (warns at 80%)
- **system:users** — Total system users and login-capable accounts

### Services

Running service status and process health:

- **service:kiwipanel** — Main panel web server (port 8443)
- **service:agent** — Root-privileged agent (Unix socket connectivity)
- **service:mariadb** — Database server (port 3306)
- **service:redis** — Cache server (port 6379, optional)
- **service:lsws** — OpenLiteSpeed web server (ports 80, 443, 7080)

### Network

External connectivity and DNS resolution:

- **port:80** — HTTP listener (OpenLiteSpeed)
- **port:443** — HTTPS listener (OpenLiteSpeed)
- **port:7080** — OpenLiteSpeed admin panel
- **port:8443** — KiwiPanel HTTPS listener
- **port:3306** — MariaDB listener
- **port:6379** — Redis listener (optional)
- **network:external_connectivity** — Outbound TCP to 8.8.8.8:53
- **network:dns_resolution** — DNS query resolution test

### Security ⭐

Critical security posture validation:

#### Privilege Boundary Validation

**security:privilege_boundary** — **Real-time verification of the root/unprivileged trust boundary**

This check connects to the root agent over a Unix socket and validates that the privilege separation model is intact:

**Binary Trust Chain:**
- `/opt/kiwipanel/bin/kiwipanel` is `root:root 0755` (with symlink resolution)
- `/opt/kiwipanel/bin/kiwipanel-agent` is `root:root 0755` (with symlink resolution)
- `/opt/kiwipanel` is `root:root 0755`
- `/opt/kiwipanel/bin` is `root:root 0755`

**Active Isolation Probes:**
- Panel user (`kiwipanel`) **cannot write** to the binary directory (live write probe)
- Panel user **cannot read** trusted update staging (live read probe)

**Trusted Staging:**
- `/var/lib/kiwipanel/update/trusted` is `root:root 0700`
- `/var/lib/kiwipanel/update/trusted/stages` is `root:root 0700`

**Service Hardening:**
- `kiwipanel-update.service` is `static` or `disabled` (never auto-enabled at boot)

> **Why This Matters:** If the unprivileged web panel (which handles untrusted HTTP requests) is compromised, this boundary prevents privilege escalation to root. The check uses **active runtime probes** (not just file stat checks) to verify the panel user cannot actually modify binaries or staging directories, even if permissions appear correct.

**Result Format:**
- ✅ **Linux, boundary intact:** `all 9 checks passed`
- ❌ **Linux, boundary violation:** `failed: <check name>` (e.g., "Binary directory isolation")
- ⚠️ **macOS development:** `not applicable on non-Linux`
- ❌ **Agent unreachable:** `agent socket not found` or `cannot connect to agent`

#### Standard Security Checks

- **security:uid0_users** — Verifies only `root` has UID 0
- **security:passwordless_sudo** — Detects `NOPASSWD` sudo rules
- **security:interactive_shells** — Count of users with login shells
- **security:unattended_upgrades** — Automatic security updates (Debian/Ubuntu)
- **security:pending_updates** — Available system package updates
- **security:firewall** — Active firewall detection (ufw, firewalld, iptables, nftables)
- **firewall:ufw** — UFW status (Ubuntu/Debian)
- **firewall:iptables** — iptables rules presence
- **firewall:nftables** — nftables ruleset presence
- **security:reboot_required** — Pending kernel/system restart
- **security:ssh_root_login** — SSH root login status
- **security:ssh_password_auth** — SSH password authentication status
- **security:ssh_port** — SSH port configuration (warns if default port 22)
- **security:intrusion_prevention** — fail2ban or CrowdSec status
- **security:world_writable_dirs** — Unsafe world-writable directories in `/opt`, `/home`, `/var/www`, `/etc`, `/root`
- **security:suid_files** — Suspicious SUID binaries

### KiwiPanel-Specific

Panel-specific configuration and operational health:

- **kiwipanel:process** — Panel service process status
- **kiwipanel:permissions** — Directory ownership (`/opt/kiwipanel`, `/etc/kiwipanel`, `/var/log/kiwipanel`)
- **kiwipanel:certificate_validity** — SSL certificate expiration check (warns at 30 days)
- **kiwipanel:ssl_permissions** — Certificate and private key ownership/modes
- **kiwipanel:https_connectivity** — HTTPS endpoint responsiveness
- **kiwipanel:certificate_details** — Certificate type and subject (Let's Encrypt vs self-signed)
- **kiwipanel:linux_users** — Panel-managed Linux user accounts (database query)

### Filesystem

Directory structure validation:

- **dir:/opt/kiwipanel/bin** — Binary directory existence
- **dir:/opt/kiwipanel/config** — Configuration directory
- **dir:/opt/kiwipanel/data** — Data directory
- **dir:/opt/kiwipanel/logs** — Log directory
- **dir:/var/log/kiwipanel** — System log directory

---

## Health Dashboard UI

The health dashboard provides a real-time, streaming view of system health:

### Visual Indicators

- **Green card** — All checks in category passed (100%)
- **Yellow card** — Some checks failed (50-99%)
- **Red card** — Critical failures (0-49%)

### Live Updates

Checks stream in progressively as they complete, providing immediate feedback without waiting for the full scan.

### Health Score

Overall system health percentage calculated as:
```
Health % = (Passed Checks / Total Checks) × 100
```

### Per-Check Details

Each check shows:
- **Name** — Structured identifier (e.g., `security:privilege_boundary`)
- **Status** — ✅ Pass or ❌ Fail
- **Details** — Context-specific information (version, path, percentage, etc.)

---

## Auto-Fix Capability

The health system includes remediation for common configuration issues:

### Fixable Issues

- **Binary not in PATH** — Creates symlink to `/usr/local/bin/kiwipanel`
- **Invalid configuration** — Backs up corrupted config and creates skeleton
- **Stopped services** — Restarts `kiwipanel`, `mariadb`, `redis`, `lsws`
- **Missing directories** — Creates required filesystem structure

### Usage

**Via CLI:**
```bash
kiwipanel check --fix
```

**Via API:**
```bash
curl -X POST https://YOUR_PANEL_DOMAIN:8443/api/health/fix \
  -H "Cookie: session=YOUR_SESSION" \
  -k
```

> **Note:** Auto-fix is conservative and only repairs well-understood issues. Complex problems require manual investigation.

---

## Security Architecture

### Privilege Separation Model

KiwiPanel uses a two-process architecture to enforce privilege isolation:

```
┌─────────────────────────────────────┐
│ Unprivileged Panel Process          │
│ User: kiwipanel:kiwisecure          │
│ - Handles HTTP requests              │
│ - Executes application logic         │
│ - Cannot modify binaries             │
│ - Cannot access trusted staging      │
└─────────────┬───────────────────────┘
              │
              │ Unix Socket IPC
              │ /run/kiwipanel/agent.sock
              │
┌─────────────▼───────────────────────┐
│ Root Agent Process                   │
│ User: root:root                      │
│ - Executes privileged operations     │
│ - Validates security boundary        │
│ - Manages system resources           │
│ - Performs trusted updates           │
└──────────────────────────────────────┘
```

### Why This Design

1. **Attack Surface Reduction** — The web-facing panel runs without privileges
2. **Privilege Escalation Prevention** — Compromising the panel does not grant root access
3. **Defense in Depth** — Multiple layers of validation (filesystem permissions, active probes, service isolation)
4. **Auditability** — All privileged operations go through a single, auditable agent

### Trust Boundary Enforcement

The **security:privilege_boundary** check validates this model at runtime by:

1. **Verifying Code Trust** — Binaries executed as root must be root-owned
2. **Testing Write Isolation** — Actually attempts to write as panel user (fails as expected)
3. **Testing Read Isolation** — Actually attempts to read trusted staging (fails as expected)
4. **Validating Service Configuration** — Update service cannot auto-start at boot

This is **not** a passive check — it actively probes the boundary to detect misconfigurations that `ls -la` alone would miss.

---

## API Reference

### GET /api/health

**Authentication:** Required (session cookie)  
**Returns:** Full health report with detailed check results

**Response:**
```json
{
  "timestamp": "2026-09-19T07:30:00Z",
  "health_pct": 95,
  "ok_count": 57,
  "total": 60,
  "summary": "57/60 checks passed",
  "results": [
    {
      "name": "security:privilege_boundary",
      "ok": true,
      "details": "all 9 checks passed",
      "category": "security"
    },
    {
      "name": "security:firewall",
      "ok": true,
      "details": "ufw active",
      "category": "security"
    }
  ]
}
```

### GET /api/health/stream

**Authentication:** Required  
**Content-Type:** `text/event-stream`  
**Returns:** Server-sent events with progressive results

**Event Format:**
```
data: {"result":{"name":"binary","ok":true,"details":"found at /opt/kiwipanel/bin/kiwipanel"},"index":1,"total":-1,"ok_count":1,"health_pct":100,"is_final":false}

data: {"result":{"name":"security:privilege_boundary","ok":true,"details":"all 9 checks passed"},"index":45,"total":-1,"ok_count":45,"health_pct":100,"is_final":false}

data: {"result":{"name":"complete","ok":true,"details":"57/60 checks passed"},"index":60,"total":60,"ok_count":57,"health_pct":95,"is_final":true}
```

### GET /api/status

**Authentication:** Not required (public endpoint)  
**Returns:** Sanitized category-level summary (no system details)

**Response:**
```json
{
  "status": "healthy",
  "health_pct": 95,
  "timestamp": "2026-09-19T07:30:00Z",
  "categories": {
    "system": {"passed": 8, "total": 8},
    "services": {"passed": 5, "total": 5},
    "network": {"passed": 8, "total": 8},
    "security": {"passed": 15, "total": 18},
    "kiwipanel": {"passed": 7, "total": 7},
    "filesystem": {"passed": 5, "total": 5}
  }
}
```

**Status Values:**
- `healthy` — 100% checks passed
- `degraded` — 50-99% checks passed
- `unhealthy` — <50% checks passed

> **Security Note:** This endpoint is designed for public monitoring (e.g., uptime services). It exposes only aggregate pass/fail counts, never detailed system information, paths, versions, or error messages.

---

## Monitoring Integration

### Prometheus/Grafana

Export health metrics via the `/api/status` endpoint:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'kiwipanel'
    metrics_path: '/api/status'
    scheme: https
    tls_config:
      insecure_skip_verify: true
    static_configs:
      - targets: ['panel.example.com:8443']
```

### Uptime Monitoring

Use `/api/status` as a health check endpoint in services like:
- UptimeRobot
- Pingdom
- StatusCake
- Datadog

**Health Check Configuration:**
- **URL:** `https://YOUR_PANEL_DOMAIN:8443/api/status`
- **Method:** GET
- **Expected Response:** HTTP 200
- **Expected Content:** `"status":"healthy"`

### Alerting

Set up alerts based on health percentage thresholds:

```bash
#!/bin/bash
# Example: Alert if health drops below 90%

HEALTH_PCT=$(curl -ks https://panel.example.com:8443/api/status | jq -r '.health_pct')

if [ "$HEALTH_PCT" -lt 90 ]; then
    echo "ALERT: KiwiPanel health at ${HEALTH_PCT}%" | mail -s "Panel Health Alert" admin@example.com
fi
```

---

## Troubleshooting

### Common Issues

**Security Boundary Check Fails**

If `security:privilege_boundary` reports a failure:

1. **Check binary ownership:**
   ```bash
   ls -la /opt/kiwipanel/bin/
   stat /opt/kiwipanel/bin/kiwipanel
   ```
   Expected: `root:root` ownership, mode `755`

2. **Check trusted staging:**
   ```bash
   ls -la /var/lib/kiwipanel/update/trusted/
   ```
   Expected: `root:root` ownership, mode `700`

3. **Review agent logs:**
   ```bash
   journalctl -u kiwipanel-agent.service -n 100
   ```

4. **Manual verification:**
   ```bash
   # These should fail (panel cannot access root-private areas)
   sudo -u kiwipanel test -w /opt/kiwipanel/bin && echo "FAIL: panel can write binaries" || echo "PASS"
   sudo -u kiwipanel test -r /var/lib/kiwipanel/update/trusted/ready && echo "FAIL: panel can read staging" || echo "PASS"
   ```

**Agent Socket Not Found**

If checks report "agent socket not found":

1. **Verify agent is running:**
   ```bash
   systemctl status kiwipanel-agent.service
   ```

2. **Check socket exists:**
   ```bash
   ls -la /run/kiwipanel/agent.sock
   ```

3. **Restart agent:**
   ```bash
   systemctl restart kiwipanel-agent.service
   ```

**Service Checks Fail**

If service checks report failures:

1. **Check service status:**
   ```bash
   systemctl status kiwipanel.service
   systemctl status mariadb.service
   systemctl status lsws.service
   ```

2. **Review service logs:**
   ```bash
   journalctl -u kiwipanel.service -n 100
   ```

3. **Attempt auto-fix:**
   ```bash
   kiwipanel check --fix
   ```

**High Disk Usage**

If `system:disk_usage` reports critical levels:

1. **Identify large directories:**
   ```bash
   du -h /var/log | sort -rh | head -20
   du -h /opt/kiwipanel | sort -rh | head -20
   ```

2. **Clean old logs:**
   ```bash
   find /var/log -type f -name "*.gz" -mtime +30 -delete
   journalctl --vacuum-time=30d
   ```

3. **Review KiwiPanel backups:**
   ```bash
   ls -lh /opt/kiwipanel/data/update-backups/
   ```

---

## Performance Considerations

### Check Duration

- **Typical full scan:** 3-5 seconds
- **Streaming delivery:** First results in <500ms
- **Individual check timeout:** 5 seconds (prevents hangs)

### Resource Usage

- **CPU:** Minimal (<2% during scan)
- **Memory:** ~10MB additional during scan
- **Disk I/O:** Read-only operations (except auto-fix)
- **Network:** Single DNS query + connectivity test

### Caching

The dashboard automatically refreshes every 60 seconds. Manual refresh is instant via the UI refresh button.

---

## Development

### Adding Custom Checks

Custom checks can be added to [`pkg/health/check.go`](../pkg/health/check.go):

```go
func CheckCustomFeature() (bool, string) {
    // Your validation logic
    if everythingOK {
        return true, "feature operational"
    }
    return false, "feature degraded"
}

// Register in GetAllChecks() and RunAllChecks()
```

### Testing

Run health checks in test mode:

```bash
go test ./pkg/health/... -v
```

### Agent Integration

Checks requiring root privileges should be added to [`internal/agent/security_boundary.go`](../internal/agent/security_boundary.go) and exposed via the agent's Unix socket API.

---

## Security Considerations

### Information Disclosure

- **Authenticated endpoint** (`/api/health`) — Full details for administrators only
- **Public endpoint** (`/api/status`) — Sanitized category counts only
- **Agent communication** — Unix socket with peer credential verification
- **No secrets exposed** — Checks never return passwords, keys, or tokens

### Privilege Escalation Prevention

- Health checks run in unprivileged panel process
- Root-required validations delegated to agent over controlled IPC
- Agent returns only pass/fail results, never privileged data
- Active probes prevent bypassing file permission checks

### Rate Limiting

The health API is rate-limited to prevent abuse:
- 10 requests per minute per session (authenticated)
- 60 requests per hour per IP (public `/api/status`)

---

## Change History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-09-19 | Initial documentation with security boundary validation |

---

## Summary

The KiwiPanel health check system provides comprehensive, real-time validation of system state, service status, and **critical security boundaries**. The **security:privilege_boundary** check is a standout feature that actively validates privilege isolation at runtime, preventing common privilege escalation attacks even if filesystem permissions are misconfigured.

For production deployments, monitor the health dashboard regularly and set up alerts on the `/api/status` endpoint to catch issues before they impact users.
