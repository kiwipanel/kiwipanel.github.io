# Updating KiwiPanel

KiwiPanel updates are operator-initiated. The dashboard checks for a compatible stable release, but it never updates the server automatically. Applying an update causes panel downtime, so plan a maintenance window.

::: warning Plan for panel downtime
The updater stops the panel, creates a verified database backup, replaces and verifies the root agent, then replaces and verifies the panel. Browser reconnection alone does not prove that an update succeeded. Always check the final update status and service logs.
:::

## Where updates come from

The dashboard checks the latest stable release from the public [`kiwipanel/install`](https://github.com/kiwipanel/install/releases) GitHub repository. Prereleases are excluded.

A release is eligible only when its release metadata resolves compatible **panel and agent binaries** for the server's operating system and architecture. A Git tag, a panel-only binary, or an artifact without valid integrity metadata is not an installable update.

The dashboard compares the compatible release version with the running panel version using semantic version comparison.

## Check for updates

### From the dashboard

1. Open **System → Update**.
2. The page automatically checks for the latest stable release.
3. Review the result:
   - **System is up to date** means the installed version matches the latest compatible release.
   - **Update available** means a newer compatible release has been found.
4. Click **Check for Updates** to run another check at any time.

An unsuccessful check is not confirmation that the server is up to date. If GitHub is unreachable or release validation fails, inspect the update logs and retry.

### From the CLI

```bash
kiwipanel panel update
```

This is a non-mutating check. It queries the latest compatible release, compares versions, and reports whether an update is available. Apply an available update from **Dashboard → System → Update**.

::: danger Do not run the internal apply command manually
[`kiwipanel panel update apply`](#cli-commands) is a root-only systemd action. It does not check for releases, download binaries, or stage an update. It only applies a previously prepared and verified root-private stage. The `kiwipanel-update.path` unit invokes it automatically.
:::

## Apply an update

When an update is available, the **Apply Update** button appears.

1. Open **System → Update**.
2. Click **Apply Update** and confirm the prompt.
3. Watch the status log while the panel prepares the update.
4. The trusted update stage is applied automatically by systemd.
5. The panel restarts. The dashboard shows a **Service is restarting** overlay while it waits for the service to return.
6. After the panel responds again, return to the update page and confirm the final result:
   - **Update Complete** with a success icon means the release pair was installed and verified.
   - **Completed with Warning** means the release may be running, but finalization requires review.
   - **Error** means preparation, installation, or recovery failed.

The completed button is intentionally disabled and remains in the explicit **Update Complete** state. This prevents a second update request while preserving a clear terminal result.

::: tip Closing the browser does not cancel preparation
Preparation runs through the trusted local agent. Once staging completes, the root-owned systemd path unit performs the apply phase independently. Do not stop the panel or edit update files while preparation or apply is active. Reopen the update page afterward and review the final status.
:::

## Update lifecycle

```text
Apply Update clicked
    │
    ├─ Dashboard requests preparation for the stable channel
    ├─ Root agent resolves and validates the compatible release
    ├─ Panel binary is downloaded and SHA-256 verified
    ├─ Agent binary is downloaded and SHA-256 verified
    ├─ Root-private staged metadata and binaries are fsynced
    ├─ trusted/ready is published atomically
    │
    ├─ kiwipanel-update.path detects trusted/ready
    └─ kiwipanel-update.service applies the stage as root:
         ├─ Validate stage metadata, ownership, modes, ELF files, and checksums
         ├─ Stop the panel and verify that it has stopped
         ├─ Create and verify a pre-update database backup
         ├─ Install and verify the agent
         ├─ Install and verify the panel
         ├─ Verify service state and HTTPS /api/ready readiness
         ├─ Update version metadata and clean up the stage
         └─ Publish done, warning, or error status
```

### Status states

The dashboard receives progress through Server-Sent Events (SSE). The status file and update logs contain the authoritative messages for troubleshooting.

| State | Meaning |
|---|---|
| `checking` | Resolving and validating a compatible release. |
| `available` | A newer compatible release was found; preparation is beginning. |
| `idle` | The installed release is already current. |
| `downloading` | Downloading and checksum-verifying the panel and agent binaries. |
| `ready` | A complete root-private stage was published; systemd will apply it automatically. |
| `validating` | Validating the staged binaries and their executable format. |
| `verifying` | Rechecking staged binary integrity. |
| `installing` | Stopping services and replacing the agent and panel binaries. |
| `finalizing` | Updating version metadata and removing temporary trusted-stage data. |
| `done` | The release pair was installed and readiness was verified. |
| `warning` | Installation may have succeeded, but finalization needs review. |
| `error` | Preparation, apply, or recovery failed. Inspect logs before retrying. |

## Trusted update flow

The web panel is not trusted to write the root update stage or replace installed binaries.

```text
Dashboard (kiwipanel:kiwisecure)
    │ POST /dashboard/update/prepare
    ▼
Root agent over an authenticated Unix socket
    │ POST /v1/update/prepare {"channel":"stable"}
    ▼
Resolve release → download and verify both binaries → publish root-private stage
    ▼
kiwipanel-update.path
    ▼
kiwipanel-update.service (root, Type=oneshot)
    ▼
Stop safely → back up database → update agent → update panel → verify readiness
```

The dashboard request contains only the allowed release channel. It cannot provide a URL, checksum, local path, marker content, or binary data. The agent authorizes the request using Unix peer credentials.

## Security and integrity checks

Every update is protected by multiple checks:

1. Release metadata must describe a compatible panel and agent pair.
2. Each binary must match its SHA-256 checksum.
3. Each binary must contain valid ELF data and have the expected executable properties.
4. Downloads are written to temporary files and atomically staged after verification.
5. The root apply process validates ownership, modes, metadata, paths, and checksums again.
6. The panel must stop before replacement; the updater fails closed if this cannot be verified.
7. The agent identity and protocol handshake are checked after installation.
8. The panel must pass the HTTPS `/api/ready` readiness check after restart.

Preparation and apply use the root-owned advisory lock at `/run/kiwipanel/update.lock`. Never delete the lock file to unlock an update. Advisory locks are released by the operating system when the owning process exits; deleting the path can create a second inode and defeat mutual exclusion.

## Release verification badge

The system health dashboard (`/dashboard/health`) includes a **Release Verification** badge showing whether the currently running KiwiPanel binary was installed from a cryptographically verified signed update.

### What the badge proves

The badge displays historical provenance: it confirms that a specific past update was applied from a signature-verified manifest and that the running binary matches the recorded installation. It does **not** re-verify the release signature on every dashboard request; the exact signed manifest envelope is not retained after apply.

### Badge states

| State | Badge | Meaning |
|-------|-------|---------|
| **Release Signature Verified** | Green | The running release was installed from a signature-verified manifest. Key ID and installation timestamp are shown inline. |
| **Provenance Unavailable** | Gray | No signed-update provenance is recorded yet. Fresh installs, legacy installs, and manually installed systems show this state until a verified update is applied. |
| **Running Build Not Verified** | Red | The running binary does not match the recorded verified release (manual replacement or rollback). |
| **Provenance Record Invalid** | Red | The recorded provenance is malformed or failed integrity checks. Inspect `/var/lib/kiwipanel/update/release-provenance.json`. |
| **Status Unknown** | Gray | Verification status could not be determined. Check panel logs for details. |

### Key ID semantics

The signing key ID (e.g., `release-2026`) is a public audit hint identifying which trusted key authenticated the manifest. It does not contain secret material and is visible to all admin users.

### Rollout nuance

Existing and fresh installs show `Provenance Unavailable` until the first signed update is applied **after** the verification feature was introduced. The release that introduces the feature cannot record its own provenance because the writer code is not yet running. Provenance recording begins with the next update.

## Automatic rollback and recovery

Recovery depends on the phase that failed:

- Metadata, ELF, or checksum validation failure: abort before binary replacement.
- Panel stop or database backup failure: abort replacement and attempt to restart the unchanged panel.
- Agent installation or handshake failure: attempt agent recovery and restart the unchanged panel.
- Panel installation or readiness failure: attempt recovery of the previous compatible panel/agent pair.
- Version metadata or stage-cleanup failure after successful installation: keep the installed release and report a warning or error instead of claiming complete success.

A verified pre-update database backup is stored under `/opt/kiwipanel/data/update-backups`. Binary rollback does not automatically restore database data or schema changes.

::: warning Rollback is an attempt, not a guarantee
Service control, filesystem operations, or readiness checks can also fail during recovery. Read the complete update logs and verify both `kiwipanel.service` and `kiwipanel-agent.service` before retrying.
:::

## Installer and updater are different

The bootstrap installer is for a fresh VPS or for resuming an interrupted installation recorded in its trusted state directory. It is not an update or reinstallation mechanism.

Do not delete installer state to force a reinstall. Use the dashboard update workflow on an installed host. If recovery is not safe, use a verified backup or a clean VPS.

## systemd units

The update is event-driven. The path unit watches the root-published marker:

```ini
[Path]
PathModified=/var/lib/kiwipanel/update/trusted/ready
Unit=kiwipanel-update.service
```

The apply service is a static root-owned oneshot service:

```ini
[Service]
Type=oneshot
ExecStart=/opt/kiwipanel/bin/kiwipanel panel update apply
User=root
Group=root
```

Only the path watcher should be enabled:

```bash
sudo systemctl enable --now kiwipanel-update.path
```

`kiwipanel-update.service` is started by the path unit when a trusted ready marker is published. It is normal for this oneshot service to show `inactive (dead)` with `Result: success` after a completed update.

## Filesystem layout

```text
/var/lib/kiwipanel/update/
├── status.json                 # Root-authored status read by the dashboard
├── release-provenance.json     # Root-authored signed-release provenance (0640, group kiwisecure)
└── trusted/
    ├── ready                   # Root-owned marker watched by systemd
    └── stages/                 # Root-private staged release data

/opt/kiwipanel/bin/
├── kiwipanel                   # Active panel binary
├── kiwipanel-agent             # Active agent binary
├── kiwipanel.bak               # Previous panel binary, when available
└── kiwipanel-agent.bak         # Previous agent binary, when available

/opt/kiwipanel/data/update-backups/
└── ...                         # Verified pre-update database backups

/opt/kiwipanel/meta/
└── current.version             # Installed version metadata
```

`status.json` is informational. It is not an input to the root apply process. The trusted stage, ready marker, lifecycle lock, installed binaries, and relevant parent directories are root-controlled.

## Troubleshooting

### The page is stuck on “Checking...”

The version check uses a short network timeout. Verify that the server can reach GitHub:

```bash
curl -fsSL https://api.github.com/repos/kiwipanel/install/releases/latest | head -20
```

Then inspect the panel and update logs.

### The page shows “Update Complete” but the browser reconnects

Reconnection only proves that the panel is reachable again. Confirm the final status and service health:

```bash
sudo systemctl status kiwipanel.service kiwipanel-agent.service --no-pager
sudo systemctl status kiwipanel-update.path kiwipanel-update.service --no-pager
sudo journalctl -u kiwipanel-update.service -n 100 --no-pager
```

Return to **System → Update** and confirm **Update Complete**, rather than relying only on the restart overlay or `/ping` response.

### The stage did not apply

Confirm that the path watcher is enabled and that the apply service is static:

```bash
sudo systemctl is-enabled kiwipanel-update.path
sudo systemctl is-enabled kiwipanel-update.service
sudo systemctl status kiwipanel-update.path kiwipanel-update.service --no-pager
sudo journalctl -u kiwipanel-update.service -n 100 --no-pager
```

The expected result is an enabled path unit. The oneshot apply service normally does not need to be enabled for boot.

### “Another update is already running”

Wait for the active operation to finish and inspect the status and journals:

```bash
sudo systemctl status kiwipanel-update.path kiwipanel-update.service --no-pager
sudo journalctl -u kiwipanel-update.service -n 100 --no-pager
sudo journalctl -u kiwipanel-agent.service -n 100 --no-pager
```

Do not delete `/run/kiwipanel/update.lock`. Confirm that no preparation or apply process remains and that service recovery completed before retrying.

### The verification badge shows "Running Build Not Verified"

The running binary does not match the recorded verified release. This occurs after:

- Manual binary replacement (e.g., copying a different build to `/opt/kiwipanel/bin/kiwipanel`)
- Manual rollback to a previous version without using the updater's recovery mechanism

If the replacement was intentional, the badge state is correct. To restore verification, apply a signed update through the normal dashboard workflow.

### The verification badge shows "Provenance Record Invalid"

The release provenance record at `/var/lib/kiwipanel/update/release-provenance.json` is malformed, has incorrect ownership or permissions, or failed integrity checks. This file is root-owned and should only be written by the updater.

Inspect the file:

```bash
sudo ls -la /var/lib/kiwipanel/update/release-provenance.json
sudo cat /var/lib/kiwipanel/update/release-provenance.json
```

To repair, apply a signed update through the dashboard. Manual editing is not supported; the updater will overwrite the file during the next successful update.

### The release has no compatible binary

Check the GitHub release artifacts for the server's operating system and architecture. The updater requires a valid release manifest and compatible panel and agent binaries. Do not bypass verification by manually staging an unverified binary.

### View update logs

Update events are available at **System → Update Logs** and in the system journal:

```bash
sudo journalctl -u kiwipanel-update.service -f
sudo journalctl -u kiwipanel-agent.service -f
```

## API reference

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/dashboard/update` | Admin | Render the update page. |
| `GET` | `/dashboard/update/check` | Admin | Lightweight compatible-version check. |
| `POST` | `/dashboard/update/prepare` | Admin | Request stable-channel preparation; returns `202`. |
| `GET` | `/dashboard/update/status` | Admin | SSE stream of update status. |
| `POST` | `/v1/update/prepare` | Local peer-authorized agent client | Request fixed-channel root preparation. |
| `GET` | `/ping` | None | Browser restart-reachability check. |

## CLI commands

| Command | Description |
|---|---|
| `kiwipanel panel update` | Non-mutating check for an available compatible update. |
| `kiwipanel panel update apply` | Internal root-only systemd action. Do not run manually as a normal operator command. |
