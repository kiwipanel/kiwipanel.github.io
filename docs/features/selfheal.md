# Self-Healing Services

KiwiPanel automatically configures crash recovery for critical services during installation. If OpenLiteSpeed, MariaDB, or Redis crashes unexpectedly, systemd restarts it within seconds — no manual intervention required, and no dependency on the KiwiPanel panel or agent being running.

## How It Works

Self-healing operates in two independent layers. Each layer catches different failure modes, and each works independently — if one layer is unavailable, the other still protects your server.

| Layer | What it catches | Who runs it | Works when panel is down? |
|-------|----------------|-------------|--------------------------|
| **Layer 0: Systemd restart policies** | Process crash or unexpected exit | systemd (OS-level) | **Yes** |
| **Layer 1: Watchdog with health probes** | "Running but unresponsive" services | KiwiPanel agent + panel | No |

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
   - **Unix socket + process check** for PHP-FPM (catches stale sockets)
3. **Circuit breaker** — if a service fails 5 times in 2 minutes, auto-healing stops and alerts the admin instead of creating a restart loop
4. **Exponential backoff** — restart delay escalates: 1s → 5s → 30s → 5min (resets only on confirmed success)

**Signal flow:**

```
DBus signals → Agent ring buffer → Panel state poller (1s) → Failed channel
Health probes (30s) → Consecutive failure check (3x) → Failed channel
Failed channel → Heal loop → Safety checks → Agent restart → Verify
```

**Safety checks (14 steps, in order):**

| # | Check | Purpose |
|---|-------|---------|
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

**Watched services are loaded from the database** (`service_monitors` table) at startup. Each row includes probe configuration (`probe_type`, `probe_target`). If the DB is empty or unreadable, the watchdog falls back to built-in defaults for OpenLiteSpeed and MariaDB. PHP-FPM versions are added dynamically based on installed lsphp packages.

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
```

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

1. **All services show "active" systemd state** and green "Healthy" probe badge
2. **Auto Heal toggles** are all ON (switches are checked)
3. **Click a toggle OFF** → the switch flips, no error toast
4. **Refresh the page** → the toggle stays OFF (persisted to DB)
5. **Click toggle ON again** → switch flips back
6. **Click "Restart" on MariaDB** → confirm dialog → service restarts, heal count increments
7. **Page auto-refreshes** every 30s (watch the "Last Check" timestamp update)

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
# Expected: "watchdog: loaded 4 services from DB"

# Verify all services are being monitored
curl -s http://localhost:8080/api/watchdog/status | jq '.[].name'
# Expected: "lsws", "lsphp", "mariadb", "redis"
```

### Quick sanity checklist

Run this after all tests to confirm the system is back to normal:

```bash
echo "=== Service status ==="
systemctl is-active lsws.service mariadb.service redis-server.service

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
