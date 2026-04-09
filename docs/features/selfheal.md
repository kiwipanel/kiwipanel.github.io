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

::: warning
Layer 1 is planned but not yet implemented. See the [implementation plan](https://github.com/kiwipanel/kiwipanel/blob/main/plans/ideas_1.md) for details.
:::

Layer 0 catches crashes, but some failures don't involve the process exiting — a database can hang on a lock, a web server can accept connections but return errors. Layer 1 handles these cases:

- **DBus signal detection** — the agent subscribes to systemd signals for instant notification when a service transitions to `failed` or `inactive`
- **Health probes** — the panel periodically checks if services are actually responding (HTTP request to OLS, TCP handshake to MariaDB, socket connection to PHP-FPM)
- **Circuit breaker** — if a service fails 5 times in 2 minutes, auto-healing stops and alerts the admin instead of creating a restart loop

## Configuration

Layer 0 is configured automatically during installation with sensible defaults. No configuration is required.

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

### Live crash test

::: danger
This causes brief downtime for the service. Only run this during a maintenance window.
:::

```bash
# Simulate a crash by killing the process
kill -9 $(pidof litespeed)

# Watch systemd restart it
journalctl -u lsws.service -f
```

You should see systemd log the process exit, then restart the service approximately 5 seconds later:

```
lsws.service: Main process exited, code=killed, status=9/KILL
lsws.service: Scheduled restart job, restart counter is at 1.
Started OpenLiteSpeed.
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

```bash
# Show recent restarts for a service
journalctl -u lsws.service --since "24 hours ago" | grep -i "restart\|started\|exited\|killed"
```

## How It Relates to Dashboard Service Controls

Self-healing does **not** interfere with the dashboard's start/stop/restart buttons:

- **Stop** via dashboard → systemd stops the service and does **not** restart it (`Restart=on-failure` only triggers on unexpected exits)
- **Restart** via dashboard → normal restart cycle, not counted toward the failure limit
- **Service crashes** → systemd detects the unexpected exit and restarts automatically

The two systems work together: the dashboard gives you manual control, and self-healing provides automatic recovery when things go wrong unexpectedly.
