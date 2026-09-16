# Updating KiwiPanel

KiwiPanel does **not** install updates automatically. The dashboard checks for new versions on page load, but you choose when to apply an update.

::: warning Plan for panel downtime
The updater stops the panel, creates a verified database backup, updates the agent, and then updates and restarts the panel. This is **not a zero-downtime update**. Browser reconnection does not by itself prove that the update succeeded; check the final update status and logs.
:::

## Where Updates Come From

The dashboard checks the latest stable release in the public **kiwipanel/install** GitHub repository:

- [Latest release](https://github.com/kiwipanel/install/releases/latest)
- [GitHub API endpoint](https://api.github.com/repos/kiwipanel/install/releases/latest)

The dashboard uses the **stable channel only**, so GitHub prereleases are excluded. It compares the compatible release version with the running panel version using semantic version comparison.

::: info A tag alone is not an installable update
The release must include a valid checksummed release manifest and compatible **panel and agent binaries** for the server's operating system and architecture. Both binaries are required. A missing or incompatible release artifact causes the check or preparation to fail rather than allowing a partial update.
:::

The release workflow builds version tags and publishes release artifacts to the public install repository. Publishing a tag in the source repository is not sufficient if that publication fails. Update discovery uses GitHub Releases, not a local release-index file.

## Checking for Updates

### From the Dashboard

1. Navigate to **System → Update** (or go to `https://your-server:8443/dashboard/update`)
2. The page automatically checks for the latest version on load
3. A successful check reports whether an update is available:

**System is up to date:**
> ✅ System is up to date  
> Current version: 0.7.0 (latest: 0.7.0)

**Update available:**
> ℹ️ Update available: 0.8.0  
> Current: 0.7.0 → Latest: 0.8.0

You can also click the **Check for Updates** button at any time to re-check.

::: warning An unsuccessful check does not mean you are up to date
The check has a 10-second timeout. If GitHub is unreachable or release validation fails, the backend returns the current version, an unknown latest version, and no available update. Investigate the logs and retry; this is not confirmation that the installed version is current.
:::

### From the CLI

```bash
kiwipanel panel update
```

This non-mutating command checks GitHub for the latest compatible release,
compares it with the binary's current version using semver, and reports whether
an update is available. Review and apply an available release from
**Dashboard → System → Update**. The internal `kiwipanel panel update apply`
subcommand applies an already staged release as root and is intended for the
systemd update service, not normal operator use.

## Installer and Updater Lifecycle Boundary

The bootstrap installer is only for a fresh VPS or for resuming an interrupted
installation recorded in its trusted state directory. It is not an update or
reinstallation mechanism. When it detects a completed installation, an active
KiwiPanel service, or durable KiwiPanel artifacts, it exits before downloads,
scaffold extraction, binary replacement, metadata changes, permission changes,
or service control.

Do not delete installer state to force a reinstall. Use the update workflow on
an installed host; use a verified backup or a clean VPS when recovery cannot be
performed safely.

## Applying an Update

When an update is available, the **Apply Update** button appears. The entire process is automated:

1. Click **Apply Update** and confirm the prompt
2. The update runs in the background — you can watch progress in real-time via the status log
3. When the service restarts, a "Service is restarting" overlay appears automatically
4. Once the service responds again, the browser redirects to the gate/login entry point

::: tip
Closing the browser does not cancel preparation. Preparation runs in the panel process; once staging completes, systemd performs the apply phase independently. Do not manually stop the panel during preparation. Return to the update page and check the logs to confirm the final result.
:::

### What Happens Behind the Scenes

The update follows a strict pipeline:

```
Apply Update clicked
    │
    ├─ 1. Cleanup any previous failed update
    ├─ 2. Fetch latest stable release from GitHub
    ├─ 3. Verify manifest and resolve compatible panel + agent assets
    ├─ 4. Download panel binary + SHA-256 verify
    ├─ 5. Download agent binary + SHA-256 verify
    ├─ 6. Write staging metadata (staged.json)
    ├─ 7. Create staged flag file
    │
    ├─ systemd detects the flag automatically:
    │      kiwipanel-update.path → triggers kiwipanel-update.service
    │
    └─ Update apply (runs as root):
           1. Validate staged metadata and acquire the apply lock
           2. Require both staged binaries; validate ELF + executable bit
           3. Recheck both SHA-256 checksums before stopping services
           4. Stop kiwipanel.service with state verification
              • Attempt graceful stop; escalate if still active
              • Abort replacement if the stop cannot be verified
           5. Create and verify a pre-update database backup
           6. Back up, install, and start the agent
           7. Verify agent version, source commit, and protocol handshake
           8. Back up, install, and start the panel
           9. Verify service state + HTTPS /api/ready
          10. Update version metadata and remove the staged flag
          11. Write status "done" (or a finalization warning)

           Installation failures → attempt recovery and verify its result
```

### Status States

The backend publishes progress via Server-Sent Events (SSE). The following states describe the update lifecycle; consult the status file and logs for warnings that may not have a dedicated dashboard presentation:

| State | What's happening |
|-------|-----------------|
| **Checking** | Querying GitHub for the latest version |
| **Available** | Preparation found a newer version; downloading follows |
| **Idle** | Preparation found that the system is already up to date |
| **Downloading** | Downloading binaries from GitHub |
| **Validating** | Checking binary format (ELF) |
| **Verifying** | Verifying SHA-256 checksums |
| **Installing** | Replacing binaries + restarting the service |
| **Finalizing** | Updating version metadata and cleanup |
| **Ready** | Staged and waiting for systemd to apply |
| **Done** | Update complete ✅ |
| **Warning** | Inspect the message and logs; installation may have succeeded with a finalization issue |
| **Error** | A step failed; inspect recovery results before retrying |

## Automatic Rollback

Recovery depends on the failed phase:

- **Metadata, ELF, or checksum validation fails** → abort before binary replacement.
- **Panel stop verification or database backup fails** → abort replacement and attempt to restart the unchanged panel.
- **Agent installation or handshake fails** → attempt agent recovery and restart the unchanged panel.
- **Panel installation or readiness fails** → attempt recovery of the previous panel/agent release pair, then verify readiness.
- **Version metadata or staged-flag cleanup fails after successful installation** → report a warning/error without rolling back the installed release.

Readiness requires an active panel service and a successful HTTPS response from `/api/ready`. This checks database and agent readiness, not just whether port 8443 accepts TCP connections. The current probe uses an initial delay and up to 30 attempts; request and service-check durations mean this is **not a fixed 30-second deadline**.

Previous binaries are saved with a `.bak` suffix during installation. Recovery may consume those backups when restoring them. A verified database backup is created before installation, but binary rollback **does not automatically restore that database backup**.

::: warning
Rollback is an attempt, not a guarantee. Service control, filesystem operations, or readiness checks can also fail during recovery. Read the complete update logs and verify both services before retrying. A finalization warning can mean the new release is already running.
:::

## Service Restart Detection

When the service restarts during an update, the browser loses its SSE connection. KiwiPanel handles this gracefully:

1. A **"Service is restarting"** overlay appears with an elapsed-time counter
2. The page polls the `/ping` endpoint every 3 seconds
3. Once the service responds, it shows "Service is back!" and redirects to the gate entry point, or `/auth` if no gate passcode is available

The `/ping` endpoint is unauthenticated and lightweight. It detects browser reachability, not update success. The updater separately checks `/api/ready` for database- and agent-aware readiness. Return to the update page and review the final status after reconnecting.

## Security Model

### Privilege Separation

The update process uses strict privilege separation:

| Component | Runs as | What it does |
|-----------|---------|--------------|
| Web panel | `kiwipanel:kiwisecure` | Downloads, verifies, stages binaries |
| Update apply | `root` (via systemd) | Replaces binaries, restarts services |

The web panel **never** runs as root. Binary replacement and service control are delegated to a systemd oneshot service.

### Integrity Verification

Every downloaded binary goes through:

1. **SHA-256 checksum** — computed during download and compared against the release manifest
2. **ELF validation** — binary must contain valid ELF magic bytes (`0x7F 'E' 'L' 'F'`)
3. **Atomic staging** — binaries are downloaded to `.tmp`, verified, then renamed (no partial writes)

### Concurrency Protection

The apply phase acquires a nonblocking OS advisory lock on `apply.lock`. A second apply process fails if another process holds that lock. The lock covers the **apply phase**; do not start overlapping preparation attempts.

::: danger Do not delete the lock file to unlock an update
File existence alone does not mean the lock is held. The OS releases the advisory lock when its owning process exits. Deleting a file that is still locked can let another process lock a different file at the same path and bypass mutual exclusion.
:::

## Filesystem Layout

```
/var/lib/kiwipanel/update/
├── status.json          # Current update status (read by SSE)
├── staged               # Flag file — triggers systemd path unit
├── staged.json          # Metadata: version, URLs, checksums
├── kiwipanel.new        # Staged panel binary
├── kiwipanel-agent.new  # Required staged agent binary
└── apply.lock           # Prevents concurrent updates

/opt/kiwipanel/bin/
├── kiwipanel            # Active panel binary
├── kiwipanel.bak        # Previous version (rollback target)
├── kiwipanel-agent      # Active agent binary
└── kiwipanel-agent.bak  # Previous agent version

/opt/kiwipanel/data/update-backups/
└── ...                  # Verified pre-update database backups

/opt/kiwipanel/meta/
└── current.version      # Version metadata
```

## systemd Units

The update is triggered automatically by a systemd path unit:

::: code-group

```ini [kiwipanel-update.path]
[Unit]
Description=Watch for KiwiPanel staged updates

[Path]
PathModified=/var/lib/kiwipanel/update/staged
Unit=kiwipanel-update.service
TriggerLimitIntervalSec=30
TriggerLimitBurst=3

[Install]
WantedBy=multi-user.target
```

```ini [kiwipanel-update.service]
[Unit]
Description=KiwiPanel Apply Staged Update
After=network.target

[Service]
Type=oneshot
ExecStart=/opt/kiwipanel/bin/kiwipanel panel update apply
User=root
Group=root
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
```

:::

When `PrepareUpdate()` creates the `/var/lib/kiwipanel/update/staged` flag file, the path unit detects it and triggers the update service, which runs `kiwipanel panel update apply` as root.

## Troubleshooting

### Update stuck on "Checking..."

The version check has a 10-second timeout. If your server can't reach GitHub's API (`api.github.com`), the check will fail. Verify:

```bash
curl -s https://api.github.com/repos/kiwipanel/install/releases/latest | head -5
```

### Update failed with "No binary found for linux/amd64"

Check the published release artifacts for your platform. The current updater requires a valid checksummed manifest and compatible panel **and** agent binaries, not just a panel asset. Missing integrity metadata or an incompatible protocol also blocks the update. Do not bypass verification by manually staging an unverified binary.

### "Another update is already running"

Another process may hold the apply lock, or lock acquisition may have failed. Inspect the service state and logs before retrying:

```bash
systemctl status kiwipanel-update.service
systemctl status kiwipanel.service kiwipanel-agent.service
journalctl -u kiwipanel-update.service -n 100 --no-pager
```

Wait for an active update to finish. After a failure, confirm that no apply process remains and inspect whether recovery completed. Do **not** delete the lock file: an unlocked leftover file does not block the next apply attempt.

### Service didn't restart after staging

After preparing an update (download + verification), the panel should restart automatically when the path unit detects the staged marker file.

Check if the systemd path unit is active:

```bash
systemctl status kiwipanel-update.path
```

If it's not running:

```bash
systemctl enable --now kiwipanel-update.path
```

If the path unit is active but the update didn't apply, check the update service logs:

```bash
journalctl -u kiwipanel-update.service -n 100
```

Common reasons for update application failure:
- Service stop verification failed (old process still running)
- Binary integrity check failed during installation
- Readiness probe timeout after restart
- Agent handshake verification failed

The updater refuses unverified replacements and attempts recovery after installation failures. Check the logs for the recovery outcome; do not assume that an error implies a successful rollback.

### Manual rollback

::: danger Recovery requires a verified release pair
Do not blindly copy backup binaries over the active files. The agent may still be running or may be restarted by socket activation, and a backup may already have been consumed by automatic recovery.
:::

If automatic recovery fails:

1. Preserve update logs and inspect the installed binaries, staged metadata, and available backups.
2. Confirm that no update preparation or apply process is running; prevent the path unit from starting another apply operation during recovery.
3. Arrange a maintenance window. Stop the panel, prevent agent socket activation, and stop the agent. Verify that both processes have stopped before replacing either binary.
4. Restore only a verified, compatible panel/agent release pair. Preserve the required ownership and permissions: panel `0750`, owned by `kiwipanel:kiwisecure`; agent `0755`, owned by `root:root`.
5. Restore normal socket/service activation, verify the agent build identity and protocol, and confirm panel readiness through `/api/ready`.
6. Review the staged marker and metadata before re-enabling the update path unit, so stale staging does not trigger another apply attempt.

Database restoration is a separate recovery decision. A binary rollback does not undo database changes. Preserve the live database and verified pre-update backup; do not overwrite the database blindly or rerun the bootstrap installer as a repair mechanism.

**If the service won't stop gracefully:**

The panel now has a 30-second graceful shutdown window. If `systemctl stop` appears hung:

1. Wait at least 35 seconds for systemd to complete its stop sequence
2. Check if it's actually stopped:
   ```bash
   systemctl is-active kiwipanel.service
   ```
3. If still active after 35 seconds, check for blocking connections or stuck workers in the journal:
   ```bash
   journalctl -u kiwipanel.service -n 50
   ```

### View update logs

Update events are logged to `/var/log/kiwipanel/update.log`. You can also view them from the dashboard at **System → Update Logs**.

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/dashboard/update` | Admin | Render the update page |
| `GET` | `/dashboard/update/check` | Admin | Lightweight version check — returns `{current, latest, available}` |
| `GET` | `/dashboard/update/status` | Admin | SSE stream of update progress |
| `POST` | `/dashboard/update/prepare` | Admin | Start update (download + stage) — returns 202 immediately |
| `GET` | `/ping` | None | Health check for restart detection — returns `{"status":"ok"}` |

### CLI Commands

| Command | Description |
|---------|-------------|
| `kiwipanel panel update` | Non-mutating check for an available compatible update; apply through Dashboard → System → Update |
| `kiwipanel panel update apply` | Internal systemd action that applies an already staged update as root |
