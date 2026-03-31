# Health Check & Support Token

KiwiPanel includes a comprehensive health check system that scans your server across multiple categories — services, security, network, filesystem, and KiwiPanel-specific checks. You can run health scans from the web dashboard, share results with support using a temporary token, or use the CLI.

## Running a Health Scan

### From the Dashboard

1. Log in to your KiwiPanel admin dashboard
2. Navigate to **Dashboard → Health** (or go directly to `https://your-server:8443/dashboard/health`)
3. The scan starts automatically and streams results in real-time
4. Each check shows a ✅ pass or ❌ fail with details

The scan covers **50+ checks** across these categories:

| Category | What it checks |
|----------|---------------|
| **System** | Public IP, CPU, load average, uptime, disk usage, memory |
| **Services** | KiwiPanel, MariaDB, Redis, OpenLiteSpeed, Agent connectivity |
| **Network** | Ports (80, 443, 7080, 8443, 3306, 6379), DNS resolution, external connectivity |
| **Security** | SSH config, firewall (UFW/iptables/nftables), SUID files, UID0 users, sudo rules, pending updates |
| **Filesystem** | Required directories, file permissions |
| **KiwiPanel** | Process status, binary permissions, SSL certificates, HTTPS connectivity, Linux users DB↔OS consistency |

### From the CLI

```bash
# Run a health check (requires root)
kiwipanel health

# Run with auto-fix for common issues
kiwipanel health --fix
```

## Linux Users Consistency Check

KiwiPanel creates one dedicated Linux user per website (e.g., `web_abc123`). The health check verifies that every website user in the panel database also exists on the OS, and vice versa.

### Possible Results

| Result | Meaning |
|--------|---------|
| ✅ `5 linux users consistent (DB = OS)` | All website users are in sync — no action needed |
| ❌ `2 in DB but not on OS: web_abc, web_def` | Website was created but the OS user is missing. File operations, terminal, and PHP will not work for these websites |
| ❌ `1 orphaned on OS: web_old` | An OS user exists but has no matching website in the panel. Typically a leftover from a failed website deletion |

### Fixing Mismatches

Use the `repair` command to automatically fix all mismatches:

```bash
# Check only — show mismatches without fixing
kiwipanel repair linux-users --check-only

# Check and fix — re-creates missing OS users, removes orphaned ones
kiwipanel repair linux-users
```

Example output:

```
Linux Users Consistency Check
=============================

  ✅ 5 linux user(s) consistent (DB = OS)
  ✖ 2 in DB but not on OS: web_abc, web_def
  ✖ 1 orphaned on OS: web_old

Repairing...

  → Re-creating OS user web_abc... ✔
  → Re-creating OS user web_def... ✔
  → Removing orphaned OS user web_old... ✔

  ✅ All linux users are now consistent (DB = OS)

Status: Repaired — fixed 2 missing, removed 1 orphaned
```

**What the repair does:**

- **Missing OS users** (in DB but not on OS): Re-creates the Linux user with the correct UID, home directory, and shell from the database record
- **Orphaned OS users** (on OS but not in DB): Deletes the Linux user and removes its home directory

::: tip
On development machines (macOS), the agent skips the `/etc/passwd` scan and reports all DB users as matched, since no real KiwiPanel OS users exist in development.
:::

## Public Health Endpoint

KiwiPanel exposes a public health status endpoint at `/api/status` that works **without authentication**. This is useful for external monitoring or quick troubleshooting.

### Tier 1: Public Summary (No Auth)

```bash
curl https://your-server:8443/api/status
```

Returns a **sanitized summary** with only category-level pass/fail counts — no sensitive details are exposed:

```json
{
  "status": "degraded",
  "health_pct": 85,
  "timestamp": "2026-03-28T07:00:00Z",
  "categories": {
    "system": { "passed": 6, "total": 7 },
    "services": { "passed": 4, "total": 5 },
    "security": { "passed": 10, "total": 12 },
    "network": { "passed": 2, "total": 2 },
    "kiwipanel": { "passed": 5, "total": 6 }
  }
}
```

The `status` field is one of:
- `healthy` — 100% checks passed
- `degraded` — 50–99% checks passed
- `unhealthy` — less than 50% checks passed

::: tip
The public summary intentionally hides all details (IPs, paths, usernames, firewall rules, version number) to prevent information leakage.
:::

### Tier 2: Full Report (Support Token Required)

To get the full health report with all details, you need a **support token**:

```bash
curl https://your-server:8443/api/status?token=kiwi_sup_xxxxxxxxxxxx
```

Returns the complete health report including version info:

```json
{
  "version": "0.7.0",
  "report": {
    "timestamp": "2026-03-28T07:00:00Z",
    "results": [
      { "name": "binary", "ok": true, "details": "found at /opt/kiwipanel/bin/kiwipanel", "category": "system" },
      { "name": "service:mariadb", "ok": true, "details": "running", "category": "services" },
      { "name": "security:ssh_root_login", "ok": false, "details": "PermitRootLogin yes", "category": "security" }
    ],
    "health_pct": 85,
    "summary": "40/47 checks passed",
    "ok_count": 40,
    "total": 47
  }
}
```

::: warning
The full report contains **sensitive security information** (SSH config, firewall rules, system users, IP addresses). Only share the support token with trusted parties.
:::

## Generating a Support Token

Support tokens are temporary (valid for **4 hours**) and give read-only access to the full health report. You can generate them from either the dashboard or the CLI.

### From the Dashboard

1. Go to **Dashboard → Health**
2. Scroll down to the **Support Access Token** section
3. Click **Generate Token**
4. The token and a ready-to-share URL will appear:

```
Token: kiwi_sup_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
URL:   https://your-server:8443/api/status?token=kiwi_sup_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

5. Use the **Copy** buttons to copy the token or full URL
6. Share the URL with support

### From the CLI

If you can't access the dashboard (e.g., panel is down), generate a token via SSH:

```bash
# Generate a new support token
kiwipanel support generate
```

Output:

```
✓ Support token generated successfully

  Token:   kiwi_sup_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
  Expires: 2026-03-28T11:00:00Z (4h 0m)

Share this URL with KiwiPanel support:
  https://<your-server>:8443/api/status?token=kiwi_sup_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

⚠ The token expires automatically after 4 hours.
  To revoke early: kiwipanel support revoke
```

### Check Token Status

```bash
kiwipanel support status
```

### Revoke a Token Early

If you want to revoke a token before it expires:

::: code-group

```bash [CLI]
kiwipanel support revoke
```

```text [Dashboard]
Dashboard → Health → Support Access Token → Revoke Token
```

:::

## Sharing Results with Support

When you need help troubleshooting your KiwiPanel installation:

### Step 1: Quick Look (No Token Needed)

Share the public health summary URL with support:

```
https://your-server:8443/api/status
```

This tells support "something is wrong in security" without exposing any details.

### Step 2: Share Full Details (Token Required)

If support needs the full report:

1. Generate a support token (dashboard or CLI)
2. Share the full URL:
   ```
   https://your-server:8443/api/status?token=kiwi_sup_xxxxxxxxxxxx
   ```
3. The token expires automatically after **4 hours**
4. You can revoke it earlier if needed

### Step 3: Download JSON (Alternative)

From the dashboard health page, you can also click **Download JSON** to save the full report locally and share it as a file (e.g., via email or a GitHub issue).

## Security

| Feature | Description |
|---------|-------------|
| **Auto-expiry** | Tokens expire after 4 hours automatically |
| **Rate limiting** | The `/api/status` endpoint is rate-limited to 10 requests/minute per IP |
| **Constant-time comparison** | Token validation uses constant-time comparison to prevent timing attacks |
| **No details in Tier 1** | Public summary exposes zero sensitive information (no IPs, paths, version, or usernames) |
| **File-based tokens** | Stored at `/opt/kiwipanel/meta/support_token.json` with `0600` permissions |
| **Audit-friendly** | Tokens use `kiwi_sup_` prefix for easy identification in logs |
| **Instant revoke** | Revoking deletes the token file, immediately invalidating any shared URLs |

## CLI Reference

| Command | Description |
|---------|-------------|
| `kiwipanel health` | Run health check |
| `kiwipanel health --fix` | Run health check with auto-fix |
| `kiwipanel repair linux-users` | Check and fix linux user consistency |
| `kiwipanel repair linux-users --check-only` | Check only, do not fix |
| `kiwipanel support generate` | Generate a 4-hour support token |
| `kiwipanel support status` | Show current token status |
| `kiwipanel support revoke` | Revoke the current token |
