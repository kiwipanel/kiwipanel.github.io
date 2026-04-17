# Local Backups — Comprehensive Documentation

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Database Schema](#3-database-schema)
4. [Backup Scopes](#4-backup-scopes)
5. [Backup Workflow (7 Steps)](#5-backup-workflow-7-steps)
6. [Restore Workflow](#6-restore-workflow)
7. [Scheduling](#7-scheduling)
8. [Retention Policy](#8-retention-policy)
9. [API Reference](#9-api-reference)
10. [Web UI Guide](#10-web-ui-guide)
11. [Concurrency & Locking](#11-concurrency--locking)
12. [IO Throttling](#12-io-throttling)
13. [Disk Space Requirements](#13-disk-space-requirements)
14. [MySQL Credential Security](#14-mysql-credential-security)
15. [File System Layout](#15-file-system-layout)
16. [Security Considerations](#16-security-considerations)
17. [Error Handling](#17-error-handling)
18. [Caveats & Known Limitations](#18-caveats--known-limitations)
19. [Tips & Tricks](#19-tips--tricks)
20. [Troubleshooting](#20-troubleshooting)
21. [Development Notes](#21-development-notes)

---

## 1. Overview

The Local Backups feature provides per-website backup and restore capabilities for KiwiPanel. It supports full backups (files + databases), files-only, and database-only backups with automatic scheduling, count-based retention, and an async agent-based execution model.

**Design principles:**

- **Asynchronous execution** — backups run in background goroutines; HTTP requests return immediately with a run ID
- **Two-tier architecture** — the Panel module manages state/metadata in SQLite; the Agent performs disk/DB operations on the host
- **Safety-first restores** — a pre-restore safety backup is always created before overwriting any data
- **Resource-aware** — IO throttling via `ionice`/`nice`, disk space pre-checks, and concurrency limits prevent resource exhaustion
- **Count-based retention** — old backups are automatically pruned after each successful backup

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Web Browser                        │
│  (backups.html — Tabler UI)                             │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS (JSON API + CSRF)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    Panel Process                        │
│                                                         │
│  transport/http/   ──▶  business/service.go             │
│  (create, list,         (TriggerBackup, TriggerRestore, │
│   schedule, etc.)        ConfigureSchedule, cleanup)    │
│                              │                          │
│  transport/http/             │  SQLite (via storage/)   │
│  callback.go  ◀──────┐      ▼                          │
│  (agent callbacks)    │  backup_jobs, backup_runs,      │
│                       │  backup_providers tables        │
└───────────────────────┼─────────────────────────────────┘
                        │ Unix Socket (/v1/backup/*)
                        │
┌───────────────────────┼─────────────────────────────────┐
│                  Agent Process                           │
│                                                         │
│  backup_router.go  ──▶  backup.go (executeBackup)       │
│    /v1/backup/create    backup_restore.go (executeRestore)│
│    /v1/backup/restore   backup_scheduler.go             │
│    /v1/backup/delete    backup_lock.go                  │
│    /v1/backup/schedule  backup_throttle.go              │
│                         backup_credentials.go           │
│                                                         │
│  Disk: /opt/kiwipanel/backups/{websiteID}/              │
│  Config: /etc/kiwipanel/backup_schedules.json           │
│  Creds: /etc/kiwipanel/mysql.cnf                        │
└─────────────────────────────────────────────────────────┘
```

**Data flow for a manual backup:**

1. User clicks "Create Backup" in the UI
2. Panel `POST /websites/{id}/backups` → `Service.TriggerBackup()` creates a `backup_run` row (status=`pending`)
3. Service calls Agent via Unix socket `POST /v1/backup/create`
4. Agent returns `202 Accepted` immediately, runs `executeBackup()` in a goroutine
5. Agent reports step progress back to Panel via callback URL (`POST /internal/backups/callback`)
6. Panel updates the `backup_runs` row with status, path, size, checksum
7. Service runs retention cleanup after completion

---

## 3. Database Schema

### 3.1 `backup_providers`

Storage destinations. Currently only `local` is seeded.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment ID |
| `provider_type` | TEXT NOT NULL | Provider type: `local`, future: `s3`, `b2` |
| `display_name` | TEXT NOT NULL | Human-readable name |
| `config_json` | TEXT DEFAULT `'{}'` | JSON config (endpoint, bucket, credentials) |
| `is_enabled` | INTEGER DEFAULT 1 | Whether this provider is active |
| `is_default` | INTEGER DEFAULT 0 | Default provider for new jobs |
| `created_at` | TEXT | ISO 8601 timestamp |
| `updated_at` | TEXT | ISO 8601 timestamp |

**Seed data:** `(1, 'local', 'Local Storage', '{}', 1, 1)`

### 3.2 `backup_jobs`

One row per website — defines the backup configuration/schedule.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment ID |
| `website_id` | INTEGER FK→websites | Owning website |
| `provider_id` | INTEGER FK→backup_providers | Storage destination (default 1=local) |
| `backup_scope` | TEXT DEFAULT `'full'` | `full`, `files`, or `database` |
| `schedule_frequency` | TEXT DEFAULT `'daily'` | `daily`, `weekly`, `monthly`, or `manual` |
| `schedule_time` | TEXT DEFAULT `'02:00'` | HH:MM in server time |
| `retention_count` | INTEGER DEFAULT 7 | Number of backups to keep |
| `is_enabled` | INTEGER DEFAULT 0 | Whether scheduling is active |
| `last_run_at` | TEXT nullable | When the last backup completed |
| `next_run_at` | TEXT nullable | Computed next run time |
| `created_at` | TEXT | Row creation time |
| `updated_at` | TEXT | Last update time |

**Indexes:** `idx_backup_jobs_website(website_id)`, `idx_backup_jobs_next_run(next_run_at) WHERE is_enabled = 1`

### 3.3 `backup_runs`

One row per backup execution (manual or scheduled).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment ID |
| `job_id` | INTEGER FK→backup_jobs | Parent job |
| `website_id` | INTEGER FK→websites | Owning website |
| `trigger_type` | TEXT DEFAULT `'manual'` | `manual` or `scheduled` |
| `status` | TEXT DEFAULT `'pending'` | `pending`, `running`, `completed`, `failed`, `cancelled` |
| `current_step` | TEXT nullable | Current step name (e.g. `db_dump`, `file_sync_pass1`) |
| `local_path` | TEXT nullable | Absolute path to archive on disk |
| `total_size` | INTEGER nullable | Archive size in bytes |
| `file_checksum` | TEXT nullable | SHA-256 hex of the archive |
| `error_message` | TEXT nullable | Error details if failed |
| `started_at` | TEXT nullable | When execution began |
| `completed_at` | TEXT nullable | When execution finished |
| `created_at` | TEXT | Row creation time |

**Indexes:** `idx_backup_runs_job(job_id, created_at DESC)`, `idx_backup_runs_status(status)`

---

## 4. Backup Scopes

| Scope | Value | What's Included |
|-------|-------|-----------------|
| **Full** | `full` | Website files (rsync of `website_root`) + MySQL database dumps (all databases in the `databases` list). This is the default and recommended scope. |
| **Files** | `files` | Only the website document root directory. No database operations. |
| **Database** | `database` | Only MySQL dumps via `mysqldump`. No file operations. |

Defined in [`domain.BackupScope`](internal/modules/backups/domain/backup.go:10).

---

## 5. Backup Workflow (7 Steps)

The 7-step workflow is implemented in [`executeBackup()`](internal/agent/backup.go:112). Each step reports progress to the panel callback URL.

### Step 1: `prepare`

- Acquires per-website lock (see [§11](#11-concurrency--locking))
- Creates staging directory: `/opt/kiwipanel/backups/{websiteID}/.staging/`
- Calculates website directory size via `filepath.Walk`
- Checks available disk space — requires **2.5× the website size** (see [§13](#13-disk-space-requirements))
- Fails fast with `ErrInsufficientDisk` if not enough space

### Step 2: `db_dump`

- Skipped if no databases are specified (files-only backup)
- Loads MySQL credentials from `/etc/kiwipanel/mysql.cnf` (see [§14](#14-mysql-credential-security))
- Validates database names (rejects names containing `..` or `/`)
- Runs `mysqldump` per database with flags: `--defaults-extra-file`, `--single-transaction`, `--quick`, `--routines`, `--triggers`
- Output: `{staging}/{dbName}.sql`
- Commands are throttled via `ionice`/`nice` in background mode

### Step 3: `file_sync_pass1` (bulk copy)

- `rsync -a --delete {website_root}/ {staging}/files/`
- Copies the full website directory tree into staging
- Throttled in background mode

### Step 4: `file_sync_pass2` (delta sync)

- Same rsync command as pass 1
- Catches files that changed during the first pass
- Provides near-consistent snapshot without downtime

### Step 5: `package`

- `tar -czf {archivePath} -C {staging} .`
- Creates a gzipped tarball of the entire staging directory (SQL dumps + files)
- Archive naming: `backup_{websiteID}_{YYYYMMDD_HHMMSS}.tar.gz`

### Step 6: `verify`

- Runs `tar tzf {archivePath}` to verify the archive is not corrupt
- Computes SHA-256 checksum of the archive file
- Removes the archive if verification fails

### Step 7: `finalize`

- Records archive metadata (size, checksum) via `os.Stat`
- Writes `metadata.json` sidecar file (see [§15](#15-file-system-layout))
- Calls [`checkDiskUsageAlert()`](internal/agent/backup_throttle.go:54) — logs a warning if disk usage exceeds 85%
- Reports final progress with archive path, size, and SHA-256

After all 7 steps, the staging directory is removed via `defer os.RemoveAll(staging)`.

---

## 6. Restore Workflow

Implemented in [`executeRestore()`](internal/agent/backup_restore.go:93). The restore has 7 steps plus a finalize:

### Step 1: `restore_verify`

- Verifies the archive file exists on disk
- If `expected_sha256` is provided, computes SHA-256 and compares — rejects on mismatch

### Step 2: `restore_extract`

- Creates restore staging dir: `/opt/kiwipanel/backups/{websiteID}/.restore_staging/`
- Extracts archive: `tar -xzf {archive} -C {staging}`

### Step 3: `restore_validate`

- Reads the sidecar `{archive}.meta.json` if it exists
- Validates that `metadata.website_id` matches the target website ID
- Prevents cross-website restore accidents

### Step 4: `restore_safety_backup` (**HARD STOP on failure**)

- Creates a safety backup of the current live website: `/opt/kiwipanel/backups/{websiteID}/.pre_restore_{timestamp}/`
- Uses `rsync -a` to copy `website_root/` → `{safetyDir}/files/`
- If this step fails, the entire restore aborts with `"HARD STOP"` — this ensures you can always roll back

### Step 5: `restore_db`

- Finds all `*.sql` files in the staging directory
- For each SQL file, derives the database name from the filename (e.g., `mydb.sql` → `mydb`)
- Validates database names (no `..` or `/`)
- Runs: `mysql --defaults-extra-file=/etc/kiwipanel/mysql.cnf -u {user} {dbName} < {sqlFile}`
- Skipped if no SQL files found or MySQL credentials unavailable

### Step 6: `restore_files`

- `rsync -a --delete {staging}/files/ {website_root}/`
- Replaces all website files atomically (rsync with `--delete`)

### Step 7: `restore_config`

- Placeholder for OLS/web server config restoration
- Currently a no-op; config restoration is handled at the panel level

### Step 8: `restore_finalize`

- Staging directory cleaned up by `defer os.RemoveAll(staging)`
- Reports completion to callback URL

---

## 7. Scheduling

### Panel-Side Configuration

The panel stores schedule config in the `backup_jobs` table and converts it to agent-side schedules.

**Frequency options:** `daily`, `weekly`, `monthly`

**Cron conversion** ([`frequencyToCron()`](internal/modules/backups/business/service.go:269)):

| Frequency | Time | Cron Expression |
|-----------|------|-----------------|
| `daily` | `02:00` | `0 2 * * *` |
| `weekly` | `02:00` | `0 2 * * 0` (Sunday) |
| `monthly` | `02:00` | `0 2 1 * *` (1st of month) |

### Agent-Side Scheduler

The agent maintains its own scheduler ([`BackupScheduler`](internal/agent/backup_scheduler.go:31)) with:

- A ticker that fires every **60 seconds** to check for due backups
- Schedule entries persisted to `/etc/kiwipanel/backup_schedules.json`
- Each entry tracks `next_run` (RFC 3339) and `last_run`
- Default schedule time is **2:00 AM** server time

**JSON persistence format** (`/etc/kiwipanel/backup_schedules.json`):

```json
[
  {
    "website_id": 1,
    "website_root": "/home/user/web/example.com",
    "linux_user": "user_1",
    "database_name": "wp_example",
    "databases": ["wp_example"],
    "frequency": "daily",
    "retain_count": 7,
    "callback_url": "http://unix/internal/backups/callback",
    "next_run": "2026-04-18T02:00:00Z",
    "last_run": "2026-04-17T02:00:00Z",
    "enabled": true
  }
]
```

When a schedule is due, the scheduler calls [`executeBackup()`](internal/agent/backup.go:112) directly (in a goroutine) and then advances `next_run` using [`calculateNextRun()`](internal/agent/backup_scheduler.go:195).

---

## 8. Retention Policy

Retention is **count-based**, not time-based. After each successful backup, [`cleanupOldBackups()`](internal/modules/backups/business/service.go:115) runs:

1. Counts all completed `backup_runs` for the job
2. If `count > retention_count`, calculates `excess = count - retention_count`
3. Fetches the oldest `excess` runs
4. For each old run:
   - Calls `agent.DeleteBackupFile()` to remove the archive from disk
   - Deletes the `backup_runs` row from the database

**Default retention:** 5 (for manually created jobs), 7 (database default for scheduled jobs).
**Range:** 1–365 (validated in [`BackupScheduleConfig.Validate()`](internal/modules/backups/domain/backup.go:116)).

---

## 9. API Reference

### Panel API (User-Facing)

All endpoints require session authentication and CSRF token.

#### List Backups

```
GET /websites/{websiteID}/backups?limit=20&offset=0
```

**Response** `200 OK`:
```json
{
  "runs": [
    {
      "id": 1,
      "job_id": 1,
      "website_id": 42,
      "trigger_type": "manual",
      "status": "completed",
      "current_step": "finalize",
      "local_path": "/opt/kiwipanel/backups/42/backup_42_20260417_020000.tar.gz",
      "total_size": 104857600,
      "file_checksum": "a1b2c3d4e5f6...",
      "started_at": "2026-04-17T02:00:00Z",
      "completed_at": "2026-04-17T02:05:30Z",
      "created_at": "2026-04-17T02:00:00Z"
    }
  ],
  "job": {
    "id": 1,
    "website_id": 42,
    "backup_scope": "full",
    "schedule_frequency": "daily",
    "schedule_time": "02:00",
    "retention_count": 7,
    "is_enabled": true,
    "last_run_at": "2026-04-17T02:05:30Z",
    "next_run_at": "2026-04-18T02:00:00Z"
  }
}
```

#### Create Backup

```
POST /websites/{websiteID}/backups
Content-Type: application/json

{
  "backup_scope": "full"
}
```

`backup_scope` defaults to `"full"` if omitted. Valid values: `full`, `files`, `database`.

**Response** `202 Accepted`:
```json
{
  "run_id": 5,
  "status": "pending"
}
```

#### Get Backup Status

```
GET /websites/{websiteID}/backups/{runID}/status
```

**Response** `200 OK`:
```json
{
  "run_id": 5,
  "status": "running",
  "current_step": "file_sync_pass1",
  "error": null
}
```

#### Restore Backup

```
POST /websites/{websiteID}/backups/{runID}/restore
```

Only works on runs with `status: "completed"`.

**Response** `202 Accepted`:
```json
{
  "run_id": 6,
  "status": "pending"
}
```

#### Delete Backup

```
DELETE /websites/{websiteID}/backups/{runID}
```

**Response** `200 OK`:
```json
{
  "status": "deleted"
}
```

#### Configure Schedule

```
POST /websites/{websiteID}/backups/schedule
Content-Type: application/json

{
  "frequency": "daily",
  "time": "02:00",
  "retention_count": 7,
  "backup_scope": "full",
  "is_enabled": true
}
```

**Response** `200 OK`:
```json
{
  "status": "ok"
}
```

### Internal Callback API (Agent → Panel)

These are registered under `/internal/backups/` and do **not** require session auth. HMAC-SHA256 signature verification is planned (see TODO in source).

#### Agent Callback

```
POST /internal/backups/callback
Content-Type: application/json

{
  "run_id": 5,
  "success": true,
  "status": "completed",
  "step": "finalize",
  "archive_path": "/opt/kiwipanel/backups/42/backup_42_20260417_020000.tar.gz",
  "total_size": 104857600,
  "file_checksum": "a1b2c3d4e5f6...",
  "error_message": ""
}
```

#### Create Run (Scheduled Backups)

```
POST /internal/backups/create-run
Content-Type: application/json

{
  "website_id": 42,
  "backup_scope": "full"
}
```

**Response** `200 OK`:
```json
{
  "run_id": 7
}
```

### Agent API (Panel → Agent via Unix Socket)

All requests go to the agent's Unix socket. Routed by [`BackupRouter()`](internal/agent/backup_router.go:18).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/backup/create` | POST | Start a backup |
| `/v1/backup/restore` | POST | Start a restore |
| `/v1/backup/delete` | POST | Delete a backup archive |
| `/v1/backup/schedule/set` | POST | Add/update a schedule |
| `/v1/backup/schedule/delete` | POST | Remove a schedule |
| `/v1/backup/schedule/get` | GET | Get schedule for a website |

---

## 10. Web UI Guide

The backup interface is at **Websites → {website} → Backups** tab ([`backups.html`](html/template/themes/backend/pages/websites/backups.html:1)).

### Dashboard Cards

Four status cards at the top:

1. **Last Backup** — color-coded status (green=completed, blue=in progress, red=failed, gray=never)
2. **Total Backups** — count of all backup runs
3. **Storage Used** — total size of all backups
4. **Auto Backup** — shows schedule status (frequency + time if enabled, "Disabled" otherwise)

### Automatic Backups Section

- Toggle switch to enable/disable
- When enabled, displays: frequency, backup time, retention days, last run, next run
- "Configure" button opens the schedule modal

### Backup History Table

Columns: Name, Type (Full/Files/Database), Size, Date, Status.

Each row has a dropdown menu:
- **Download** — (completed backups only)
- **Restore** — opens confirmation modal with warning
- **Delete** — opens confirmation modal

### Modals

- **Create Backup** — radio selector for Full/Files/Database, info alert about background processing
- **Restore Backup** — warning modal ("This action cannot be undone")
- **Delete Backup** — danger modal for permanent deletion
- **Configure Schedule** — frequency select, time picker, retention count, backup type select

### Auto-Polling

The UI automatically polls `GET .../status` every **5 seconds** for any rows with `running` or `pending` status, and reloads the page when the backup completes or fails.

---

## 11. Concurrency & Locking

Implemented in [`backup_lock.go`](internal/agent/backup_lock.go:1).

### Per-Website Mutex

Each website gets a [`websiteMutex`](internal/agent/backup_lock.go:28) stored in a `sync.Map` keyed by `websiteID`. This prevents concurrent backup and restore operations on the same website.

The mutex tracks:
- `held` — whether the lock is currently held
- `heldBy` — lock type (`lockBackup` or `lockRestore`)
- `acquiredAt` — timestamp for stale lock detection

### Global Semaphore

A buffered channel `globalBackupSem` with capacity **2** limits the system to at most **2 concurrent backup/restore operations** across all websites.

### TOCTOU Protection

A separate `lockAcquireMu` mutex serializes the "load or store" operation on the `websiteLocks` sync.Map, preventing a race where two goroutines could both create a new mutex for the same website.

### Lock Acquisition Flow

```
1. Try to send to globalBackupSem (non-blocking) → fail if full
2. Lock lockAcquireMu → LoadOrStore websiteMutex → unlock lockAcquireMu
3. Lock websiteMutex.mu → check held → set held=true → unlock mu
```

### Stale Lock Watchdog

[`startLockWatchdog()`](internal/agent/backup_lock.go:90) runs every **10 minutes** and releases any locks held for more than **2 hours** (assumed stuck/crashed).

---

## 12. IO Throttling

Implemented in [`backup_throttle.go`](internal/agent/backup_throttle.go:1).

### Background Mode (default for scheduled backups)

All shell commands are prefixed with:
```
ionice -c2 -n7 nice -n 10 <command>
```

- `ionice -c2 -n7` — best-effort IO class, lowest priority (7)
- `nice -n 10` — reduced CPU scheduling priority

This ensures backups don't impact website performance.

### Urgent Mode (manual backups)

Commands run without `ionice`/`nice` wrappers — full system priority. Used when [`TriggerManual`](internal/modules/backups/domain/backup.go:22) is the trigger type.

The mode is set in [`Service.TriggerBackup()`](internal/modules/backups/business/service.go:65):
```go
if trigger == domain.TriggerManual {
    req.Throttle = domain.ThrottleUrgent
}
```

---

## 13. Disk Space Requirements

Before starting a backup, the agent calculates required space in [`executeBackup()`](internal/agent/backup.go:138):

```
requiredSpace = websiteDirSize × 2.5
```

The **2.5× multiplier** accounts for:
- 1× for the staging copy of files
- 1× for the compressed tar.gz archive
- 0.5× safety margin for SQL dumps and temporary data

Available space is checked via `syscall.Statfs`. If `available < requiredSpace`, the backup fails immediately.

### 85% Alert Threshold

After each backup completes, [`checkDiskUsageAlert()`](internal/agent/backup_throttle.go:54) calculates the disk usage percentage. If it exceeds **85%**, a warning is logged:

```
WARN disk usage above 85%  path=/opt/kiwipanel/backups  used_percent=87.3%
```

---

## 14. MySQL Credential Security

Implemented in [`backup_credentials.go`](internal/agent/backup_credentials.go:1).

### CNF File Format

Credentials are stored in `/etc/kiwipanel/mysql.cnf`:

```ini
[client]
user=kiwipanel_backup
password=s3cret_p4ssw0rd
```

The parser reads `user=` and `password=` lines (simple key=value, no section handling beyond ignoring `[client]`).

### Permission Enforcement

The file **must** have `0600` permissions. The parser rejects any file where `perm & 0o077 != 0` (i.e., no group or world access). This is checked via `os.FileInfo.Mode().Perm()`.

### Why Not CLI Arguments?

MySQL passwords are **never** passed as command-line arguments because:
- CLI args are visible in `ps aux` and `/proc/{pid}/cmdline`
- `--defaults-extra-file` is the MySQL-recommended approach
- The CNF file is read directly by `mysqldump`/`mysql` clients

The `--defaults-extra-file` flag is always passed as the **first** argument to `mysqldump` and `mysql`.

---

## 15. File System Layout

### Backup Directories

```
/opt/kiwipanel/backups/                   # backupBaseDir
├── {websiteID}/                           # per-website directory
│   ├── backup_{id}_{YYYYMMDD_HHMMSS}.tar.gz       # archive
│   ├── backup_{id}_{YYYYMMDD_HHMMSS}.tar.gz.meta.json  # metadata sidecar
│   ├── .staging/                          # temporary during backup (cleaned up)
│   ├── .restore_staging/                  # temporary during restore (cleaned up)
│   └── .pre_restore_{YYYYMMDD_HHMMSS}/   # safety backup before restore
│       └── files/                         # rsync of website_root
```

### Archive Contents

```
backup_42_20260417_020000.tar.gz
├── files/                    # rsync of website_root
│   ├── index.php
│   ├── wp-config.php
│   └── ...
├── mydb.sql                  # mysqldump output (one per database)
└── otherdb.sql
```

### metadata.json Format

Written as `{archiveName}.meta.json` alongside the archive:

```json
{
  "website_id": 42,
  "linux_user": "user_1",
  "created_at": "2026-04-17T02:05:30Z",
  "archive_file": "backup_42_20260417_020000.tar.gz",
  "sha256": "a1b2c3d4e5f6789...",
  "size_bytes": 104857600,
  "databases": ["wp_example"],
  "steps": ["prepare", "db_dump", "file_sync_pass1", "file_sync_pass2", "package", "verify"]
}
```

### Configuration Files

| Path | Description |
|------|-------------|
| `/etc/kiwipanel/mysql.cnf` | MySQL credentials (0600 perms) |
| `/etc/kiwipanel/backup_schedules.json` | Persisted scheduler state (0640 perms) |

---

## 16. Security Considerations

### Path Traversal Validation

Multiple layers of path validation:

1. **Agent backup create** — rejects `website_root` containing `..` ([`backup.go:85`](internal/agent/backup.go:85))
2. **Agent restore** — rejects `website_root` and `archive_path` containing `..`; additionally requires `archive_path` to start with `backupBaseDir` ([`backup_restore.go:58-73`](internal/agent/backup_restore.go:58))
3. **Agent delete** — [`validateBackupPath()`](internal/agent/backup_delete.go:14) checks: non-empty, absolute, no `..`, `filepath.Clean()` resolves under `backupBaseDir`
4. **Database names** — rejects names containing `..` or `/`

### HMAC Callbacks (Planned)

The internal callback endpoints (`/internal/backups/callback`, `/internal/backups/create-run`) have TODO comments for HMAC-SHA256 signature verification via `X-Agent-Signature` header. Currently, these endpoints rely on not being exposed externally.

### CSRF Protection

All user-facing API endpoints require a `X-CSRF-Token` header, enforced by the panel's middleware.

### Permissions

- Archive files are created with `0640` permissions (metadata.json)
- Staging directories use `0750` permissions
- MySQL credentials file requires `0600`

---

## 17. Error Handling

### Domain-Level Errors

| Error | Defined In | When |
|-------|-----------|------|
| `ErrBackupJobNotFound` | [`domain/backup.go:135`](internal/modules/backups/domain/backup.go:135) | No job exists for the website |
| `ErrBackupRunNotFound` | [`domain/backup.go:136`](internal/modules/backups/domain/backup.go:136) | Run ID doesn't exist |
| `ErrBackupInProgress` | [`domain/backup.go:137`](internal/modules/backups/domain/backup.go:137) | Website already has an active backup |
| `ErrInsufficientDisk` | [`domain/backup.go:138`](internal/modules/backups/domain/backup.go:138) | Not enough disk space |

### Agent-Level Errors

| Error Message | Cause |
|---------------|-------|
| `"global backup concurrency limit reached"` | Already 2 backups running system-wide |
| `"website {id} already locked by {type}"` | Another backup/restore in progress for this website |
| `"insufficient disk space: need X bytes, have Y"` | Disk space check failed |
| `"mysqldump {db}: ..."` | Database dump failed |
| `"rsync pass1/pass2: ..."` | File sync failed |
| `"archive verification failed"` | tar.gz integrity check failed |
| `"sha256 mismatch: expected X, got Y"` | Archive corrupted during restore |
| `"HARD STOP: safety backup failed"` | Pre-restore safety backup failed — restore aborted |
| `"metadata website_id mismatch"` | Trying to restore a backup from a different website |
| `"mysql credentials file has insecure permissions"` | `/etc/kiwipanel/mysql.cnf` is not 0600 |

### Status Transitions

```
pending → running → completed
pending → running → failed
pending → cancelled (not yet implemented)
```

---

## 18. Caveats & Known Limitations

1. **No incremental backups** — every backup is a full copy. Large websites will produce large archives every time.

2. **No download endpoint** — the UI shows a "Download" button but there's no download handler implemented yet. Archives are only accessible on the server filesystem.

3. **Domain/LinuxUser resolution is TODO** — the HTTP handlers pass empty strings for `domainName` and `linuxUser`. These need to be resolved from the website service.

4. **HMAC callback verification not implemented** — internal callback endpoints are not yet authenticated. They must not be exposed to the internet.

5. **No encryption at rest** — backup archives are stored as plain tar.gz files.

6. **Restore replaces everything** — `rsync --delete` removes files in the target that aren't in the backup. There's no selective restore.

7. **Safety backups are not auto-cleaned** — `.pre_restore_*` directories accumulate and must be manually cleaned.

8. **Single-server only** — the agent and panel must run on the same machine (Unix socket communication).

9. **No backup progress percentage** — only step names are reported, not byte-level progress.

10. **Concurrent scheduled backups** — if more than 2 websites have backups due at the same time, the third will fail with the concurrency limit error.

11. **The restore `restore_db` step uses plain `mysql` import**, not atomic `RENAME TABLE` — despite the domain constant name. It's a standard `mysql < dump.sql` pipe.

---

## 19. Tips & Tricks

1. **Schedule off-peak hours** — default 2:00 AM is a good choice. Avoid peak traffic times.

2. **Use `files` scope for static sites** — skip database dumps if your site has no database to save time and space.

3. **Set retention_count wisely** — for daily backups, 7 keeps a week of history. For weekly, 4 keeps a month.

4. **Monitor disk usage** — the 85% alert only logs; set up external monitoring on `/opt/kiwipanel/backups/`.

5. **Check metadata.json** — to quickly verify a backup without extracting it, read the `.meta.json` sidecar for size, checksum, and included steps.

6. **Manual urgent backups before risky changes** — manual backups use urgent (un-throttled) mode for faster completion.

7. **Clean up safety backups** — periodically remove `/opt/kiwipanel/backups/{id}/.pre_restore_*` directories.

8. **Verify checksums** — `sha256sum /opt/kiwipanel/backups/42/backup_42_*.tar.gz` and compare with `metadata.json`.

---

## 20. Troubleshooting

### Backup stuck in "running" status

**Cause:** The agent process crashed or the callback failed.
**Fix:** The stale lock watchdog releases locks after 2 hours. Check agent logs. Manually update the `backup_runs` row status to `failed` if needed.

### "global backup concurrency limit reached"

**Cause:** Two other backups are already running.
**Fix:** Wait for them to complete, or increase `globalBackupSem` capacity in [`backup_lock.go:39`](internal/agent/backup_lock.go:39).

### "insufficient disk space"

**Cause:** Less than 2.5× the website size is available.
**Fix:** Free disk space or reduce website size. Check which old backups can be deleted.

### "mysql credentials file has insecure permissions"

**Cause:** `/etc/kiwipanel/mysql.cnf` is world-readable.
**Fix:** `chmod 600 /etc/kiwipanel/mysql.cnf && chown root:root /etc/kiwipanel/mysql.cnf`

### Restore fails with "HARD STOP"

**Cause:** Cannot create the safety backup directory or rsync the current files.
**Fix:** Check disk space and permissions on `/opt/kiwipanel/backups/{websiteID}/`. The restore was safely aborted — no data was modified.

### SHA-256 mismatch on restore

**Cause:** Archive was corrupted after creation (disk error, manual editing).
**Fix:** Delete the corrupt backup and create a new one. Check disk health with `smartctl`.

### Scheduled backups not running

**Cause:** Schedule not persisted, or `is_enabled` is false, or scheduler not initialized.
**Fix:** Check `/etc/kiwipanel/backup_schedules.json` exists and has correct entries. Verify agent logs show "backup scheduler started".

### Callbacks returning errors

**Cause:** Panel process restarted or callback URL unreachable.
**Fix:** Check panel logs for "backups callback" errors. The backup likely completed on disk even if the callback failed — check `/opt/kiwipanel/backups/{id}/` for recent archives.

---

## 21. Development Notes

### Local Testing on macOS

The agent code uses several **Linux-only** features:

| Feature | File | Issue on macOS |
|---------|------|----------------|
| `ionice` / `nice` | [`backup_throttle.go`](internal/agent/backup_throttle.go:14) | `ionice` doesn't exist on macOS. Background mode commands will fail. |
| `syscall.Statfs_t` | [`backup_throttle.go`](internal/agent/backup_throttle.go:46) | Works on macOS but field names differ slightly. Currently compiles. |
| `mysqldump` / `mysql` | [`backup.go`](internal/agent/backup.go:176), [`backup_restore.go`](internal/agent/backup_restore.go:195) | Requires MySQL client binaries installed. |
| `/opt/kiwipanel/backups/` | [`backup.go:17`](internal/agent/backup.go:17) | Path doesn't exist by default; create it or override. |
| `/etc/kiwipanel/mysql.cnf` | [`backup_credentials.go:10`](internal/agent/backup_credentials.go:10) | Must be created manually for testing. |
| Unix socket (agent) | [`route.go`](internal/modules/backups/route.go:18) | Works on macOS. |

### Running Tests

The panel-side business logic is fully testable without Linux:

```bash
go test ./internal/modules/backups/...
go test ./internal/agent/... -run 'Test.*Unit'
```

Agent integration tests that invoke `rsync`, `tar`, `mysqldump` require a Linux environment or Docker.

### Key Interfaces for Mocking

- [`business.Repository`](internal/modules/backups/business/interface.go:10) — mock the database layer
- [`business.AgentClient`](internal/modules/backups/business/interface.go:38) — mock the agent communication

Both are interfaces, enabling straightforward test doubles.
