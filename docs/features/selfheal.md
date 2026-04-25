# Self-Healing Services

KiwiPanel automatically configures crash recovery for critical services during installation. If OpenLiteSpeed, MariaDB, Redis, or other monitored services crash unexpectedly, systemd restarts them within seconds — no manual intervention required, and no dependency on the KiwiPanel panel or agent being running.

## How It Works

Self-healing operates in two independent layers. Each layer catches different failure modes, and each works independently — if one layer is unavailable, the other still protects your server.

| Layer | What it catches | Who runs it | Works when panel is down? |
|-------|----------------|-------------|--------------------------|
| **Layer 0: Systemd restart policies** | Process crash or unexpected exit | systemd (OS-level) | **Yes** |
| **Layer 1: Watchdog with health probes** | "Running but unresponsive" services | KiwiPanel agent + panel | No |

::: info Why the two layers do not conflict
The two layers are **complementary, not overlapping**, by design:

- **Disjoint failure modes.** Layer 0 fires on *process exit* (non-zero status or signal). Layer 1 fires on *unresponsive-but-alive* services and on PHP-specific conditions that have no systemd unit at all (broken `lsphp` binary, OPcache exhaustion, etc.). A given failure is almost always owned by exactly one layer.
- **PHP has no systemd unit.** `lsphp` workers are forked by OpenLiteSpeed on demand and have no `lsphp.service`, so Layer 0 cannot see them. All PHP self-healing lives exclusively in Layer 1.
- **Reload, not restart.** The watchdog's PHP heal action kills workers and issues `systemctl reload openlitespeed` (which sends `SIGUSR1`). A reload is not a crash, so Layer 0's `Restart=on-failure` policy never fires during a heal — no duplicated restart, no counter increment.
- **Layer 0 wins races.** If OLS itself hard-crashes, systemd restarts it in ~5s while the watchdog polls every 10s. By the time Layer 1 polls, OLS is already back up and the heal is skipped with `already running`. This is the intended ordering: fast OS-level recovery first, slower userland recovery as a safety net.
- **Cooldown and circuit breaker.** Layer 1 enforces a 60s minimum between heals and trips its circuit breaker after 5 failures in 2 minutes, so it cannot produce a burst of reloads that would indirectly pressure Layer 0's rate limiter.
:::

### Layer 0: Systemd Restart Policies

Installed automatically during KiwiPanel installation. This layer uses **systemd drop-in overrides** — small config files that tell systemd to restart a service if its process exits unexpectedly.

**What happens when a service crashes:**

1. The service process exits with a non-zero code (or is killed by a signal)
2. systemd detects the exit within milliseconds
3. systemd waits 5 seconds, then restarts the service
4. If the service crashes 5 times within 5 minutes, systemd stops trying (prevents restart loops)

**Services covered:**

| Service | Detected as |
|---------|------------|
| OpenLiteSpeed | `lsws`, `lshttpd`, or `openlitespeed` (whichever is installed) |
| MariaDB | `mariadb` or `mysql` |
| Redis | `redis-server` or `redis` (only if installed) |

KiwiPanel's own services (`kiwipanel.service`, `kiwipanel-agent.service`) already have restart policies built into their unit files.

::: info
Layer 0 uses `Restart=on-failure`, not `Restart=always`. This means systemd only restarts the service when it crashes — it does **not** restart services you intentionally stopped with `systemctl stop`. An admin stop is respected.
:::

### Layer 1: Watchdog with Health Probes

Layer 0 catches crashes, but some failures don't involve the process exiting — a database can hang on a lock, a web server can accept connections but return errors. Layer 1 handles these cases through the **Watchdog Manager**, which runs in the panel process and delegates privileged operations to the agent.

**How it works:**

1. **DBus signal detection** — the agent subscribes to systemd DBus signals for instant notification (~1s) when a service transitions to `failed` or `inactive`
2. **Health probes** — the panel periodically checks if services are actually responding:
   - **HTTP** for OpenLiteSpeed (accepts 200, 301, 302, 403)
   - **TCP + MySQL handshake** for MariaDB (catches hung/exhausted servers)
   - **TCP** for Redis (`:6379`) and SSH (`:22`)
   - **Unix socket + process check** for PHP-FPM (catches stale sockets)
   - **Systemd-only** for firewall (firewalld/ufw), fail2ban, and cron — service is healthy if systemd reports `active`
   - **Agent ping** for the KiwiPanel agent — healthy if the panel can reach the agent Unix socket
3. **Circuit breaker** — if a service fails 5 times in 2 minutes, auto-healing stops and alerts the admin instead of creating a restart loop
4. **Exponential backoff** — restart delay escalates: 1s → 5s → 30s → 5min (resets only on confirmed success)

**Signal flow:**

```
DBus signals → Agent ring buffer → Panel state poller (1s) → Failed channel
Health probes (30s) → Consecutive failure check (3x) → Failed channel
Failed channel → Heal loop → Safety checks → Agent restart → Verify
```

**Safety checks (15 steps, in order):**

| # | Check | Purpose |
|---|-------|---------|
| 0 | Agent self-heal guard | `kiwipanel-agent` cannot restart itself via the agent — detection-only |
| 1 | Service name validation | Allowlist from DB (or regex fallback) |
| 2 | Dedup suppression (5s) | DBus + probe both fire — skip second |
| 3 | Cooldown (30s) | Don't restart if just restarted |
| 4 | Transient state | Don't restart mid-activation/deactivation |
| 5 | Dependency check | Don't restart PHP-FPM if OLS is down |
| 6 | Circuit breaker | Stop after 5 failures in 2 minutes |
| 7 | Per-service mutex | Prevents concurrent heal on same service |
| 8 | Global semaphore | Max 2 concurrent heals |
| 9 | Hard timeout (60s) | Prevents hung heal operations |
| 10 | Exponential backoff | Progressive delay between attempts |
| 11 | Unit existence | Validates systemd unit exists |
| 12 | Agent restart + verify | Blocks until service is active |
| 13 | Post-heal probe | Confirms application-level health |
| 14 | Backoff reset | Only on confirmed success |

**Watched services are loaded from the database** (`service_monitors` table) at startup. Each row includes probe configuration (`probe_type`, `probe_target`). Services whose systemd units don't exist on the system are silently skipped — for example, Redis, fail2ban, or firewall won't be monitored if they aren't installed. For distro-specific services, the unit name is resolved at runtime: `firewalld` vs `ufw`, and `cron` vs `crond`. If the DB is empty or unreadable, the watchdog falls back to built-in defaults for OpenLiteSpeed, MariaDB, and Redis. PHP-FPM versions are added dynamically based on installed lsphp packages.

**Default monitored services:**

| Service | Probe Type | Probe Target | Notes |
|---------|-----------|--------------|-------|
| OpenLiteSpeed | `http` | `http://localhost:80/` | Core web server |
| MariaDB | `tcp` | `:3306` | TCP + MySQL handshake |
| Redis | `tcp` | `:6379` | Skipped if not installed |
| LSPHP (per version) | `lsphp_process` | — | OLS-managed, binary health check |
| KiwiPanel Agent | `agent_ping` | — | Detection-only, cannot self-heal |
| Firewall | `systemd_only` | — | Detects firewalld (RHEL) or ufw (Debian) |
| Fail2Ban | `systemd_only` | — | Skipped if not installed |
| SSH (sshd) | `tcp` | `:22` | Always present on Linux |
| Cron | `systemd_only` | — | Detects cron (Debian) or crond (RHEL) |

**Special cases:**

- **KiwiPanel Agent** — the agent is the panel's lifeline for restarting services. If the agent goes down, the watchdog detects it and surfaces the failure on the dashboard, but cannot restart it through the normal heal path (which uses the agent). Recovery depends on Layer 0 (`Restart=on-failure` in the agent's systemd unit file).
- **Firewall and Cron** — the systemd unit name varies by distro. KiwiPanel uses feature detection at startup: it checks which unit exists (`firewalld.service` vs `ufw.service`, `cron.service` vs `crond.service`) rather than checking `/etc/os-release`.

## Dashboard

The watchdog dashboard is accessible at **Dashboard → Service Watchdog** and shows real-time status of all monitored services.

| Column | Description |
|--------|-------------|
| Service | Service name and systemd unit |
| Systemd | Current systemd state (active, inactive, failed, activating, etc.) |
| Health Probe | Application-level health check result |
| Circuit Breaker | OK or tripped (with reason on hover) |
| Auto Heal | Toggle switch — enables/disables auto-restart per service |
| Heal Count | Number of successful auto-heals since startup |
| Uptime | Time since service last became active |
| Actions | Manual restart, reset circuit breaker |

The page auto-refreshes every 30 seconds.

### Auto-Restart Toggle

Each service has an **Auto Heal** toggle switch on the dashboard. When disabled:

- The watchdog still **monitors** the service (systemd state, health probes)
- But it will **not** automatically restart the service when failures are detected
- Manual restart via the dashboard button still works

The toggle state is persisted to the `service_monitors` table (`auto_restart` column) and survives panel restarts. At startup, the watchdog loads the saved state from DB — services default to auto-restart enabled.

**Use cases for disabling auto-restart:**
- Debugging a service that keeps crashing (prevent restart during investigation)
- Planned maintenance where you expect the service to be down
- A service that has a known issue and needs manual attention

### Circuit Breaker

If a service fails to restart 5 times within 2 minutes, the circuit breaker trips:

- Auto-healing is **disabled** for that service
- The dashboard shows a red "Tripped" badge with the reason
- An event is logged to the events table
- The admin must click **Reset Breaker** after fixing the root cause

Resetting the breaker also clears the exponential backoff, so the next auto-heal attempt starts fresh.

## Configuration

### Layer 0 (Systemd)

Configured automatically during installation with sensible defaults. No configuration is required.

**Default restart policy:**

```ini
[Unit]
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Restart=on-failure
RestartSec=5
```

| Setting | Value | Meaning |
|---------|-------|---------|
| `Restart=on-failure` | — | Restart only on crash, not on intentional stop |
| `RestartSec=5` | 5 seconds | Wait 5 seconds before restarting |
| `StartLimitBurst=5` | 5 attempts | Maximum 5 restart attempts... |
| `StartLimitIntervalSec=300` | 5 minutes | ...within a 5-minute window |

If the service fails more than 5 times in 5 minutes, systemd marks it as failed and stops restarting. At that point, manual investigation is needed.

### Layer 1 (Watchdog)

The watchdog uses production-ready defaults defined in `DefaultWatchdogConfig()`:

| Setting | Default | Description |
|---------|---------|-------------|
| Probe interval | 30s | Base interval between health probes (+0–5s jitter) |
| Probe interval (agent down) | 10s | Faster probing when agent is unreachable |
| Min restart interval | 30s | Cooldown between restarts per service |
| Startup grace timeout | 120s | Wait for systemd to finish booting before healing |
| Restart verify timeout | 30s | How long the agent blocks waiting for service to become active |
| Max concurrent heals | 2 | Maximum services being healed simultaneously |
| Probe failure threshold | 3 | Consecutive probe failures before triggering heal |
| Circuit breaker max failures | 5 | Failures within window before breaker trips |
| Circuit breaker window | 2 min | Time window for failure counting |

## Verifying Self-Healing

### Check drop-in files exist

```bash
ls -la /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf
ls -la /etc/systemd/system/mariadb.service.d/kiwipanel-restart.conf
```

### Confirm systemd loaded the overrides

```bash
systemctl show lsws.service -p Restart,RestartUSec,StartLimitIntervalUSec,StartLimitBurst
systemctl show mariadb.service -p Restart,RestartUSec,StartLimitIntervalUSec,StartLimitBurst
```

Expected output:

```
Restart=on-failure
RestartUSec=5s
StartLimitIntervalUSec=5min
StartLimitBurst=5
```

### View the full merged unit file

```bash
systemctl cat lsws.service
```

This shows the base unit file followed by a comment `# /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf` and the override contents — confirming systemd has merged the drop-in.

### Check watchdog status via API

```bash
# From the server itself (requires authentication)
curl -s http://localhost:8080/api/watchdog/status | jq .
```

Returns a JSON array of service states including systemd state, probe health, circuit breaker status, heal count, and auto-restart setting.

## Live VPS Testing

::: danger
All crash tests cause **brief service downtime**. Run these during a maintenance window, not on production servers serving live traffic.
:::

### Prerequisites

Before testing, confirm everything is wired up:

```bash
# 1. Verify both panel and agent are running
systemctl status kiwipanel.service
systemctl status kiwipanel-agent.service

# 2. Check the agent socket exists
ls -la /run/kiwipanel/agent.sock

# 3. Confirm service_monitors are seeded in the DB
sqlite3 /opt/kiwipanel/data/kiwipanel.db "SELECT service_name, auto_restart, probe_type, probe_target FROM service_monitors;"
```

Expected DB output:
```
lsws|1|http|http://localhost:80/
lsphp|1|unix_socket|/tmp/lshttpd/lsphp.sock
mariadb|1|tcp|:3306
redis|1|tcp|:6379
kiwipanel-agent|1|agent_ping|
firewall|1|systemd_only|
fail2ban|1|systemd_only|
sshd|1|tcp|:22
cron|1|systemd_only|
```

Note: Some services (redis, fail2ban, etc.) may not appear if they are not installed on the system — the watchdog skips units that don't exist at startup.

### Test 1: Layer 0 — Systemd crash recovery (OLS)

Tests that systemd restarts a crashed service within ~5 seconds.

```bash
# Open a second terminal to watch logs in real-time
journalctl -u lsws.service -f &

# Kill OLS hard (simulates unexpected crash)
kill -9 $(pidof litespeed)

# Wait ~5-7 seconds, then verify it came back
sleep 7
systemctl is-active lsws.service
# Expected: active

# Check restart counter incremented
systemctl show lsws.service -p NRestarts
```

Expected journal output:
```
lsws.service: Main process exited, code=killed, status=9/KILL
lsws.service: Scheduled restart job, restart counter is at 1.
Started OpenLiteSpeed.
```

### Test 2: Layer 0 — Systemd crash recovery (MariaDB)

```bash
journalctl -u mariadb.service -f &

kill -9 $(pidof mariadbd)

sleep 7
systemctl is-active mariadb.service
# Expected: active
```

### Test 3: Layer 1 — Watchdog detects DBus signal

Tests that the watchdog detects a service failure via DBus and triggers a heal.

```bash
# Watch the panel logs for watchdog activity
journalctl -u kiwipanel.service -f --grep="watchdog" &

# Kill OLS — systemd will NOT auto-restart if you temporarily disable the drop-in
# (This isolates Layer 1 from Layer 0)
systemctl stop lsws.service
rm /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf
systemctl daemon-reload
systemctl start lsws.service

# Now kill OLS — only Layer 1 (watchdog) can bring it back
kill -9 $(pidof litespeed)

# Watch the panel log — you should see within ~1-2 seconds:
#   watchdog: healing lsws (trigger: auto, backoff: 1s)
#   watchdog: lsws healed successfully

# Verify OLS is back
sleep 10
systemctl is-active lsws.service
# Expected: active

# IMPORTANT: restore the drop-in afterward
cat > /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf << 'EOF'
# Installed by KiwiPanel — automatic restart on failure
[Unit]
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Restart=on-failure
RestartSec=5
EOF
chmod 644 /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf
systemctl daemon-reload
```

### Test 4: Layer 1 — Health probe detects unresponsive service

Tests that the watchdog catches a "running but unresponsive" service. This simulates a scenario where the process is alive but not serving requests.

```bash
# Block OLS from accepting connections (port 80) using iptables
# The process stays running but probes will fail
iptables -A INPUT -p tcp --dport 80 -j DROP

# Watch panel logs — after ~3 consecutive probe failures (30s each = ~90-100s),
# the watchdog should trigger a heal
journalctl -u kiwipanel.service -f --grep="watchdog"

# Wait for 3 probe cycles + heal
sleep 120

# Check the API status — heal_count should have incremented
curl -s http://localhost:8080/api/watchdog/status | jq '.[] | select(.name=="lsws") | {heal_count, probe_healthy, systemd_active}'

# IMPORTANT: remove the iptables rule
iptables -D INPUT -p tcp --dport 80 -j DROP
```

### Test 5: Circuit breaker trips after repeated failures

Tests that the circuit breaker stops auto-healing after 5 failures in 2 minutes.

```bash
# Temporarily break OLS config so it crashes immediately on restart
cp /usr/local/lsws/conf/httpd_config.conf /usr/local/lsws/conf/httpd_config.conf.bak
echo "INVALID_DIRECTIVE" >> /usr/local/lsws/conf/httpd_config.conf

# Temporarily disable Layer 0 to isolate the watchdog
rm /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf
systemctl daemon-reload

# Kill OLS and watch the watchdog try (and fail) to restart it
kill -9 $(pidof litespeed) 2>/dev/null || systemctl stop lsws.service

# Watch panel logs for breaker trip
journalctl -u kiwipanel.service -f --grep="watchdog"

# After ~2 minutes, you should see:
#   watchdog: heal failed for lsws: ... (breaker tripped: true)

# Verify via API
curl -s http://localhost:8080/api/watchdog/status | jq '.[] | select(.name=="lsws") | {breaker_tripped, breaker_reason}'
# Expected: breaker_tripped = true

# Fix the config and restore
cp /usr/local/lsws/conf/httpd_config.conf.bak /usr/local/lsws/conf/httpd_config.conf

# Restore Layer 0 drop-in
cat > /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf << 'EOF'
# Installed by KiwiPanel — automatic restart on failure
[Unit]
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Restart=on-failure
RestartSec=5
EOF
chmod 644 /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf
systemctl daemon-reload

# Start OLS manually
systemctl start lsws.service

# Reset the breaker via API (or from the dashboard)
curl -s -X POST http://localhost:8080/api/watchdog/reset-breaker/lsws \
  -H "X-CSRF-Token: <your-csrf-token>" \
  -H "Cookie: <your-session-cookie>"
```

### Test 6: Auto-restart toggle

Tests that disabling auto-restart prevents the watchdog from healing a service.

```bash
# Check current auto_restart state
curl -s http://localhost:8080/api/watchdog/status | jq '.[] | select(.name=="lsws") | {name, auto_restart}'
# Expected: auto_restart = true

# Toggle it OFF via API (or use the dashboard toggle switch)
curl -s -X POST http://localhost:8080/api/watchdog/toggle-auto-restart/lsws \
  -H "X-CSRF-Token: <your-csrf-token>" \
  -H "Cookie: <your-session-cookie>" | jq .
# Expected: {"status":"ok","service":"lsws","auto_restart":false}

# Verify it persisted in DB
sqlite3 /opt/kiwipanel/data/kiwipanel.db "SELECT service_name, auto_restart FROM service_monitors WHERE service_name='lsws';"
# Expected: lsws|0

# Temporarily disable Layer 0, then kill OLS
rm /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf
systemctl daemon-reload
systemctl start lsws.service
kill -9 $(pidof litespeed)

# Watch logs — the watchdog should log "skipping auto-heal for lsws (auto_restart disabled)"
journalctl -u kiwipanel.service --since "1 minute ago" --grep="watchdog.*lsws"

# OLS should stay DOWN because both layers are disabled
sleep 15
systemctl is-active lsws.service
# Expected: inactive or failed

# Re-enable auto-restart
curl -s -X POST http://localhost:8080/api/watchdog/toggle-auto-restart/lsws \
  -H "X-CSRF-Token: <your-csrf-token>" \
  -H "Cookie: <your-session-cookie>" | jq .
# Expected: auto_restart = true

# Restore Layer 0 drop-in and start OLS
cat > /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf << 'EOF'
# Installed by KiwiPanel — automatic restart on failure
[Unit]
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Restart=on-failure
RestartSec=5
EOF
chmod 644 /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf
systemctl daemon-reload
systemctl start lsws.service
```

### Test 7: Dashboard UI verification

Open the panel dashboard and navigate to **Service Watchdog**:

1. **All installed services show their current state** — core services (OLS, MariaDB, sshd) should show "active" with green "Healthy" badges. Optional services (Redis, fail2ban, etc.) only appear if installed.
2. **KiwiPanel Agent** shows healthy status (agent_ping probe)
3. **Firewall** shows the resolved unit (firewalld or ufw depending on distro)
4. **Auto Heal toggles** are all ON (switches are checked)
5. **Click a toggle OFF** → the switch flips, no error toast
6. **Refresh the page** → the toggle stays OFF (persisted to DB)
7. **Click toggle ON again** → switch flips back
8. **Click "Restart" on MariaDB** → confirm dialog → service restarts, heal count increments
9. **Click "Restart" on KiwiPanel Agent** → should show an error or be disabled (agent cannot restart itself)
10. **Page auto-refreshes** every 30s (watch the "Last Check" timestamp update)

### Test 8: Agent endpoints (direct verification)

Test the agent's watchdog endpoints directly via the Unix socket:

```bash
# Get current service states from the agent
curl -s --unix-socket /run/kiwipanel/agent.sock http://agent/v1/watchdog/state | jq .

# Check if lsws systemd unit exists
curl -s --unix-socket /run/kiwipanel/agent.sock "http://agent/v1/watchdog/unit-exists?unit=lsws.service" | jq .
# Expected: {"exists":true}

# Check if litespeed process is alive
curl -s --unix-socket /run/kiwipanel/agent.sock "http://agent/v1/watchdog/process-alive?name=litespeed" | jq .
# Expected: {"alive":true}

# Check if mariadbd process is alive
curl -s --unix-socket /run/kiwipanel/agent.sock "http://agent/v1/watchdog/process-alive?name=mariadbd" | jq .
# Expected: {"alive":true}
```

### Test 9: DB-driven service loading (after reboot)

Verifies that the watchdog loads services from `service_monitors` at startup.

```bash
# Reboot the server
reboot

# After reboot, SSH back in and check the panel log for DB loading
journalctl -u kiwipanel.service --since "5 minutes ago" --grep="watchdog.*loaded"
# Expected: "watchdog: loaded N services from DB" (N depends on installed services)

# Check if any services were skipped (not installed on this system)
journalctl -u kiwipanel.service --since "5 minutes ago" --grep="watchdog.*skipping"
# Expected: "watchdog: skipping fail2ban — unit fail2ban.service not found on this system" (if not installed)

# Verify all services are being monitored
curl -s http://localhost:8080/api/watchdog/status | jq '.[].name'
# Core services always present: "lsws", "mariadb", "kiwipanel-agent", "sshd"
# Optional (if installed): "redis", "lsphp", "firewall", "fail2ban", "cron"
```

### Quick sanity checklist

Run this after all tests to confirm the system is back to normal:

```bash
echo "=== Service status ==="
systemctl is-active lsws.service mariadb.service redis-server.service sshd.service

echo "=== Security services ==="
systemctl is-active fail2ban.service 2>/dev/null || echo "fail2ban: not installed"
systemctl is-active firewalld.service 2>/dev/null || systemctl is-active ufw.service 2>/dev/null || echo "firewall: not found"

echo "=== Drop-in files ==="
ls /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf 2>/dev/null && echo "OLS: OK" || echo "OLS: MISSING"
ls /etc/systemd/system/mariadb.service.d/kiwipanel-restart.conf 2>/dev/null && echo "MariaDB: OK" || echo "MariaDB: MISSING"

echo "=== Watchdog status ==="
curl -s http://localhost:8080/api/watchdog/status | jq '.[] | {name, systemd_active, probe_healthy, breaker_tripped, auto_restart}'

echo "=== DB auto_restart ==="
sqlite3 /opt/kiwipanel/data/kiwipanel.db "SELECT service_name, auto_restart FROM service_monitors;"

echo "=== iptables clean ==="
iptables -L INPUT -n | grep -c "DROP.*dport 80" && echo "WARNING: iptables rule still active!" || echo "Clean"
```

## Troubleshooting

### Service keeps crashing and systemd gave up

If a service has hit the restart limit (5 failures in 5 minutes), systemd stops trying. Check the logs first:

```bash
journalctl -u lsws.service -n 50 --no-pager
```

After fixing the root cause, reset the failure counter and start the service:

```bash
systemctl reset-failed lsws.service
systemctl start lsws.service
```

### Watchdog circuit breaker tripped

If the watchdog's circuit breaker has tripped (visible on the dashboard), the service failed to restart 5 times within 2 minutes. This usually means:

1. The service has a configuration error (check `journalctl -u <service>`)
2. A dependency is missing (e.g., MariaDB data directory corrupt)
3. The system is out of resources (disk full, OOM)

After fixing the root cause:
1. Click **Reset Breaker** on the watchdog dashboard, or
2. Restart the service manually from the dashboard

### Auto-restart is disabled but service is still restarting

Layer 0 (systemd drop-ins) operates independently of the watchdog. Disabling auto-restart on the dashboard only affects Layer 1. If systemd's `Restart=on-failure` is active, crashed services will still be restarted by systemd.

To fully prevent automatic restarts, you would also need to remove the systemd drop-in:

```bash
rm /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf
systemctl daemon-reload
```

### Drop-in file is missing

If the override file doesn't exist (e.g., after a manual reinstall of the service), you can recreate it:

```bash
mkdir -p /etc/systemd/system/lsws.service.d

cat > /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf << 'EOF'
# Installed by KiwiPanel — automatic restart on failure
[Unit]
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Restart=on-failure
RestartSec=5
EOF

chmod 644 /etc/systemd/system/lsws.service.d/kiwipanel-restart.conf
systemctl daemon-reload
```

### Checking if a restart happened recently

::: tip
OpenLiteSpeed may log under `lshttpd.service` instead of `lsws.service` depending on your distribution. If one returns no entries, try the other.
:::

```bash
# Show recent restarts for OpenLiteSpeed
journalctl -u lshttpd.service --since "24 hours ago" --no-pager | grep -i "restart\|started\|exited\|killed"

# If no entries, try the alias
journalctl -u lsws.service --since "24 hours ago" --no-pager | grep -i "restart\|started\|exited\|killed"

# MariaDB
journalctl -u mariadb.service --since "24 hours ago" --no-pager | grep -i "restart\|started\|exited\|killed"
```

## How It Relates to Dashboard Service Controls

Self-healing does **not** interfere with the dashboard's start/stop/restart buttons:

- **Stop** via dashboard → systemd stops the service and does **not** restart it (`Restart=on-failure` only triggers on unexpected exits). The watchdog also respects intentional stops (only heals when systemd says "active" but the probe fails).
- **Restart** via dashboard → normal restart cycle, not counted toward the failure limit
- **Service crashes** → systemd detects the unexpected exit and restarts automatically. If the service comes back "active" but unresponsive, the watchdog detects this via health probes and triggers a restart through the agent.

The two systems work together: the dashboard gives you manual control, and self-healing provides automatic recovery when things go wrong unexpectedly.

## OLS-Managed PHP Health Detection

PHP under OpenLiteSpeed is managed differently from other services — OLS spawns lsphp workers on-demand (no systemd unit). The watchdog monitors PHP through multiple layers:

| Check | What it detects | State reported |
|-------|----------------|----------------|
| Process scan (`/proc/*/exe`) | Workers currently running | `ols-running` |
| Binary existence | Binary file present, no workers | `ols-idle` (healthy) |
| Binary missing | lsphp binary not found | `ols-stopped` (unhealthy) |
| `lsphp -v` execution test | Binary exists but broken (missing libs, bad extensions) | `ols-degraded` + `binary_broken` |
| stderr.log scan | Fatal errors (OPcache, segfault, memory) | `ols-degraded` + specific reason |

### What auto-heals vs. what needs operator action

| Root cause | Auto-healed? | Typical recovery time |
|-----------|--------------|----------------------|
| Worker crash / segfault (process died, binary intact) | ✅ Yes — OLS respawns on next request | seconds |
| OPcache memory exhaustion (stderr fatal errors) | ✅ Yes — watchdog kills stale workers; OLS respawns fresh ones with empty OPcache | under 2 min |
| Transient library / symbol error from a recently loaded extension | ✅ Yes — respawning workers re-loads the extension cleanly if the file is now OK | under 2 min |
| Broken binary on disk (missing libs, corrupted install, swapped with a non-PHP file) | ❌ No — respawning can't repair the binary | requires operator (reinstall PHP) |
| Missing binary (uninstalled / deleted) | ❌ No — nothing to spawn | requires operator (reinstall PHP) |

> **If you see `ols-degraded` with reason `binary_broken` on the dashboard:**
> The watchdog has flagged PHP as broken and is attempting heals, but heals
> won't succeed until the binary itself is fixed. Reinstall the affected
> PHP version: `apt install --reinstall lsphp84 lsphp84-common` (adjust
> the version suffix for your installed versions).
>
> **For all other `ols-degraded` reasons** (e.g. `opcache_memory`,
> `segfault`, `allowed_memory_exhausted`), the watchdog will clear the
> issue within ~1–2 minutes by cycling workers — no operator action needed.
> You can verify by watching the dashboard: the degraded state should
> flip back to `ols-idle` / `ols-running` after the next heal cycle.

### PHP-specific tests

### Test: PHP worker crash recovery

```bash
# Watch logs
journalctl -u kiwipanel -u kiwipanel-agent -f --grep="watchdog\|lsphp\|heal" &

# Find installed PHP versions
ls /usr/local/lsws/lsphp*/bin/lsphp

# Generate PHP traffic to spawn workers
curl -s http://localhost/ > /dev/null

# Kill all workers for a specific version (simulates crash)
pkill -9 -f "/usr/local/lsws/lsphp84/bin/lsphp"

# OLS automatically re-spawns workers on next request — verify:
sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost/
# Expected: 200 (OLS handles this natively)
```

### Test: Broken PHP binary detection

Tests the binary health check — detects PHP that exists but can't execute.

> **Important caveats before running this test:**
>
> 1. **The heal action cannot fix a broken binary.** Healing PHP means killing
>    workers so OLS respawns fresh ones. If the binary itself is broken
>    (e.g. replaced with `/bin/false`), respawning won't help — the operator
>    must restore the real binary. The watchdog's job here is **detection
>    and alerting**, not magical binary repair.
> 2. **Only the first heal attempt is logged.** Subsequent attempts within
>    the cooldown window (60s by default) are silently skipped as
>    `skipped_cooldown` (filtered as noise). To capture the heal log line,
>    start `journalctl -f` BEFORE breaking the binary.
> 3. **Detection latency is up to 70s** — the binary health result is cached
>    for 60s to avoid spawning `lsphp -v` on every 10s state poll.
> 4. **Where to find the detection log:** A broken binary fails silently
>    *before* PHP can write to its own `stderr.log`, so the PHP / LSPHP
>    log tab will show the friendly "✓ No PHP / LSPHP errors recorded"
>    status (this is intentional — an empty PHP error log is a healthy
>    signal). The full detection trail lives in the **Agent log**
>    (`Dashboard → Logs → Agent`). After a complete break/restore cycle
>    you should see **two** lines:
>    - `agent: watchdog binary health check FAILED for lsphp84: ... — reason: binary_broken`
>    - `agent: watchdog binary health check RECOVERED for lsphp84: ... now executes successfully`
>
>    The RECOVERED line confirms the heal succeeded. If you only see
>    FAILED, give it another ~70s — the recovery probe runs on the next
>    poll cycle after the heal invalidates the binary-health cache.

```bash
# Step 1: Start log tail FIRST (in another terminal or background)
journalctl -u kiwipanel -u kiwipanel-agent -f \
  | grep -E "watchdog|lsphp|heal|degraded" &
TAIL_PID=$!

# Step 2: Break the binary (replace with /bin/false)
mv /usr/local/lsws/lsphp84/bin/lsphp /usr/local/lsws/lsphp84/bin/lsphp.bak
cp /bin/false /usr/local/lsws/lsphp84/bin/lsphp
chmod +x /usr/local/lsws/lsphp84/bin/lsphp

# Step 3: Verify it's broken
/usr/local/lsws/lsphp84/bin/lsphp -v
# Expected: exit code 1, no output

# Step 4: Wait for detection cycle (60s cache TTL + 10s poll buffer)
sleep 75

# Step 5: Confirm the agent reports ols-degraded with reason
curl -s --unix-socket /run/kiwipanel/agent.sock http://agent/v1/watchdog/state \
  | python3 -m json.tool
# Expected JSON includes:
#   "services":         { ..., "lsphp84": "ols-degraded", ... }
#   "degraded_reasons": { "lsphp84": "binary_broken" }
#
# Note: the "degraded_reasons" key is omitted entirely when no service
# is degraded (json:"...,omitempty"). Its absence is normal in healthy state.

# Step 6: Look for the heal log line in the tail above. Expected:
#   watchdog: healing OLS PHP lsphp84 (trigger: auto, backoff: ...)
#   watchdog: OLS PHP lsphp84 workers restarted successfully
# (Or, if the binary is broken-by-design, the heal succeeds but the
# next poll re-reports ols-degraded — by design, since the binary
# is still broken. This is the alerting signal for the operator.)

# Step 7: RESTORE the real binary
mv /usr/local/lsws/lsphp84/bin/lsphp.bak /usr/local/lsws/lsphp84/bin/lsphp
kill $TAIL_PID 2>/dev/null

# Step 8: Verify recovery (within ~70s the cache TTL refreshes)
/usr/local/lsws/lsphp84/bin/lsphp -v
# Expected: PHP 8.4.x (litespeed)
sleep 75
curl -s --unix-socket /run/kiwipanel/agent.sock http://agent/v1/watchdog/state \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['services'].get('lsphp84'))"
# Expected: ols-idle  (or ols-running if requests are coming in)
```

### Test: Missing PHP binary detection (ols-stopped)

```bash
# Rename binary to simulate uninstalled PHP
mv /usr/local/lsws/lsphp84/bin/lsphp /usr/local/lsws/lsphp84/bin/lsphp.bak

# Wait for state poll
sleep 15

# Check agent state
curl -s --unix-socket /run/kiwipanel/agent.sock http://agent/v1/watchdog/state | \
  python3 -c "import sys,json; d=json.load(sys.stdin); [print(f'{k}: {v}') for k,v in d.get('services',{}).items() if 'lsphp' in k]"
# Expected: lsphp84: ols-stopped

# Restore
mv /usr/local/lsws/lsphp84/bin/lsphp.bak /usr/local/lsws/lsphp84/bin/lsphp
```

### Test: PHP stderr fatal detection (ols-degraded)

```bash
# Simulate a fatal error in OLS stderr log
STDERR_LOG="/usr/local/lsws/logs/stderr.log"
echo "$(date '+%Y-%m-%d %H:%M:%S') PHP Fatal error: opcache.memory_consumption exhausted" >> "$STDERR_LOG"

# Wait for next state poll
sleep 15

# Check agent state — idle PHP versions should show ols-degraded
curl -s --unix-socket /run/kiwipanel/agent.sock http://agent/v1/watchdog/state | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('services:', {k:v for k,v in d.get('services',{}).items() if 'lsphp' in k}); print('reasons:', d.get('degraded_reasons',{}))"
# Expected: ols-degraded with reason "opcache_memory"
# Note: JSON key is "degraded_reasons" (snake_case) and is omitted when empty.

# Clean up: the fake log line will expire after 5 minutes (the stderr scanner
# only looks at entries within the last 5 minutes)
```

### Reading PHP / LSPHP logs from the dashboard

The **PHP / LSPHP** tab in `Dashboard → Logs` aggregates entries from:

- `/usr/local/lsws/logs/stderr.log` — shared LSPHP stderr (fatals, OPcache exhaustion, segfaults)
- `/var/log/lsws/stderr.log` — alternate path on some installs
- `/var/log/lsws/php_error.log` — global PHP error log (when configured)
- `/usr/local/lsws/lsphp*/logs/error.log` — per-version error logs

The panel process (`kiwipanel` user) cannot read `stderr.log` directly because
it is owned `nobody:nogroup` with mode `0640`. When direct reads return
nothing the panel **proxies the read through the agent** (which runs as root
and can read every file). This is automatic and requires no operator action.

**An empty PHP / LSPHP tab is normal and healthy.** PHP only writes to its
error logs when fatal errors occur. A long-running, well-behaved server may
have a completely empty `stderr.log` — in that case the tab shows:

```
✓ No PHP / LSPHP errors recorded.

This is usually a healthy signal: PHP only writes to its error logs when
fatal errors occur (segfaults, OPcache exhaustion, missing shared libraries,
etc.). An empty log typically means your PHP workers are running without
crashes.
```

The message also reminds operators that **watchdog detection events**
(broken binaries, healing actions) are recorded in the **Agent log tab**,
not here. A broken binary fails before PHP can write anything, so its
detection trail will only ever appear in the agent log — never in the PHP
log tab. See the *Test: Broken PHP binary detection* section above for
the exact log lines to grep for.

### Verified test matrix (production VPS)

The following scenarios have been verified end-to-end on a live VPS and
should remain part of the regression checklist for any change to the
watchdog or PHP self-heal layer:

| # | Scenario                                | Expected outcome                                                                                                          | Source of truth                                |
|---|-----------------------------------------|---------------------------------------------------------------------------------------------------------------------------|------------------------------------------------|
| 1 | OLS systemd crash                       | systemd `Restart=on-failure` brings it back within seconds; restart counter increments                                    | `systemctl status openlitespeed`               |
| 2 | MariaDB systemd crash                   | systemd `Restart=on-failure` brings it back within seconds                                                                | `systemctl status mariadb`                     |
| 3 | Watchdog DBus signal (Layer 1)          | `kiwipanel` (panel) reacts within seconds without polling                                                                 | `journalctl -u kiwipanel \| grep watchdog`      |
| 4 | OLS health probe failure                | Watchdog flips state to `degraded` → triggers heal                                                                        | Agent log + dashboard watchdog tab             |
| 5 | Circuit breaker trips after 5 failures  | Heals stop; manual reset required                                                                                          | Watchdog tab → "Circuit Breaker" status        |
| 6 | Auto-restart toggle OFF                 | No heal attempts even when service is dead                                                                                | Agent log shows no heal calls                  |
| 7 | Dynamic service add/remove              | New lsphp version appears in monitor list within 60s of installation                                                       | `agent: watchdog discovered PHP lsphpXX`       |
| 8 | DB-driven loading after reboot          | Monitors restored from `service_monitors` table                                                                            | `service_monitor` rows on first boot           |
| 9 | **Broken PHP binary (lsphp -v fails)**  | State → `ols-degraded` with reason `binary_broken`; FAILED + RECOVERED lines appear in Agent log after the cycle completes | Agent log + watchdog state JSON                |
| 10| **Empty PHP stderr.log**                | PHP / LSPHP tab shows the friendly "✓ No PHP / LSPHP errors recorded" status                                              | Dashboard PHP / LSPHP log tab                  |
| 11| **Real PHP fatal in stderr.log**        | Line appears in PHP / LSPHP tab under "LSPHP Shared (stderr)" within seconds                                              | Dashboard PHP / LSPHP log tab                  |

For scenarios 9-11, the recommended manual reproduction is:

```bash
# Scenario 9 — broken binary cycle
LSPHP_BIN=/usr/local/lsws/lsphp84/bin/lsphp
sudo cp -p $LSPHP_BIN ${LSPHP_BIN}.real
sudo cp /bin/false $LSPHP_BIN && sleep 70
sudo cp -p ${LSPHP_BIN}.real $LSPHP_BIN && sleep 70
sudo journalctl -u kiwipanel-agent --since "5 minutes ago" \
  | grep -E "binary health check (FAILED|RECOVERED)"
sudo rm ${LSPHP_BIN}.real

# Scenario 11 — inject a fake fatal so the PHP tab populates
echo "[$(date '+%a %b %d %H:%M:%S %Y')] [STDERR] PHP Fatal error: Test" \
  | sudo tee -a /usr/local/lsws/logs/stderr.log >/dev/null
# ... refresh the dashboard PHP / LSPHP tab ...
sudo truncate -s 0 /usr/local/lsws/logs/stderr.log   # cleanup
```
