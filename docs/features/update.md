# Updating KiwiPanel

KiwiPanel does **not** update automatically. You must explicitly check for new versions and choose when to apply updates. The update system is designed for zero-downtime — the page automatically reloads once the new version is running.

## Checking for Updates

### From the Dashboard

1. Navigate to **System → Update** (or go to `https://your-server:8443/dashboard/update`)
2. The page automatically checks for the latest version on load
3. You'll see one of two states:

**System is up to date:**
> ✅ System is up to date  
> Current version: 0.7.0 (latest: 0.7.0)

**Update available:**
> ℹ️ Update available: 0.8.0  
> Current: 0.7.0 → Latest: 0.8.0

You can also click the **Check for Updates** button at any time to re-check.

### From the CLI

```bash
kiwipanel panel update
```

This checks GitHub for the latest release and compares it against your installed version using semver.

## Applying an Update

When an update is available, the **Apply Update** button appears. The entire process is automated:

1. Click **Apply Update** and confirm the prompt
2. The update runs in the background — you can watch progress in real-time via the status log
3. When the service restarts, a "Service is restarting" overlay appears automatically
4. Once the service is back online, the page reloads itself

::: tip
You do not need to stay on the page. The update continues in the background even if you close the browser. You can return to the update page later to see the result.
:::

### What Happens Behind the Scenes

The update follows a strict pipeline:

```
Apply Update clicked
    │
    ├─ 1. Cleanup any previous failed update
    ├─ 2. Fetch latest release from GitHub
    ├─ 3. Match binary for your OS/architecture
    ├─ 4. Download panel binary + SHA-256 verify
    ├─ 5. Download agent binary + SHA-256 verify
    ├─ 6. Write staging metadata (staged.json)
    ├─ 7. Create staged flag file
    │
    ├─ systemd detects the flag automatically:
    │      kiwipanel-update.path → triggers kiwipanel-update.service
    │
    └─ Update apply (runs as root):
           1. Validate binary (ELF magic bytes)
           2. Verify SHA-256 checksum
           3. Stop kiwipanel.service
           4. Backup current binary → .bak
           5. Install new binary
           6. Start kiwipanel.service
           7. Health check (systemctl + TCP port 8443)
           8. Apply agent update (if available)
           9. Update version metadata
          10. Write status "done"
```

### Status States

The update page shows real-time progress via Server-Sent Events (SSE):

| State | What's happening |
|-------|-----------------|
| **Checking** | Querying GitHub for the latest version |
| **Available** | New version found, waiting for you to apply |
| **Downloading** | Downloading binaries from GitHub |
| **Validating** | Checking binary format (ELF) |
| **Verifying** | Verifying SHA-256 checksums |
| **Installing** | Replacing binaries + restarting the service |
| **Finalizing** | Updating version metadata and cleanup |
| **Ready** | Staged and waiting for systemd to apply |
| **Done** | Update complete ✅ |
| **Error** | Something failed — click Retry |

## Automatic Rollback

If anything goes wrong during the update, KiwiPanel automatically rolls back:

- **Service fails to start** → previous binary is restored, service restarted
- **Health check fails** (service not responding on port 8443 within 30s) → rollback triggered
- **Checksum mismatch** → update aborted before any binary replacement

The previous binary is always preserved as a `.bak` file until the update succeeds.

::: warning
Rollback restores the previous version automatically. If you see an error state, click **Retry** to attempt the update again, or check the update logs for details.
:::

## Service Restart Detection

When the service restarts during an update, the browser loses its SSE connection. KiwiPanel handles this gracefully:

1. A **"Service is restarting"** overlay appears with a countdown timer
2. The page polls the `/ping` endpoint every 3 seconds
3. Once the service responds, it shows "Service is back!" and reloads the page automatically

The `/ping` endpoint is unauthenticated and lightweight — it works even when sessions are cleared by the restart.

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

A file lock (`apply.lock`) prevents multiple updates from running simultaneously. If an update is already in progress, additional attempts fail immediately.

## Filesystem Layout

```
/var/lib/kiwipanel/update/
├── status.json          # Current update status (read by SSE)
├── staged               # Flag file — triggers systemd path unit
├── staged.json          # Metadata: version, URLs, checksums
├── kiwipanel.new        # Staged panel binary
├── kiwipanel-agent.new  # Staged agent binary (if available)
└── apply.lock           # Prevents concurrent updates

/opt/kiwipanel/bin/
├── kiwipanel            # Active panel binary
├── kiwipanel.bak        # Previous version (rollback target)
├── kiwipanel-agent      # Active agent binary
└── kiwipanel-agent.bak  # Previous agent version

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
curl -s https://api.github.com/repos/kiwipanel/kiwipanel/releases/latest | head -5
```

### Update failed with "No binary found for linux/amd64"

The release doesn't include a binary for your platform. Check that the release has an asset named `kiwipanel-linux-amd64` (or your OS/arch combination).

### "Another update is already running"

An update lock file exists. Wait for the current update to finish, or if it's stuck:

```bash
rm /var/lib/kiwipanel/update/apply.lock
```

### Service didn't restart after staging

Check if the systemd path unit is active:

```bash
systemctl status kiwipanel-update.path
```

If it's not running:

```bash
systemctl enable --now kiwipanel-update.path
```

### Manual rollback

If you need to manually restore the previous version:

```bash
systemctl stop kiwipanel.service
cp /opt/kiwipanel/bin/kiwipanel.bak /opt/kiwipanel/bin/kiwipanel
systemctl start kiwipanel.service
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
| `kiwipanel panel update` | Check if an update is available |
| `kiwipanel panel update apply` | Apply a staged update (requires root) |
