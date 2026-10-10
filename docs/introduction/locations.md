# Location

This page lists the directories and files that KiwiPanel creates on a server, what each one is for, and which parts of the system are allowed to write to them.

::: tip Two kinds of location
**Code** lives under `/opt/kiwipanel` and is root-owned — the panel cannot rewrite its own binaries. **Runtime state** is split between `/opt/kiwipanel/{config,data,logs,meta}`, `/var/lib/kiwipanel`, and `/etc/kiwipanel`. Understanding that split explains nearly every permission error you will encounter.
:::

## Web page

- `/home/kiwiweb/default_site/index.html`: This is the default index file when you visit the IP address of your VPS.
- `/home/linux_user/domain.com/public_html`: This is the home directory for each domain. You can create a new directory here and upload your (HTML or PHP) website files.

## Default locations

Here are the folders on your VPS that KiwiPanel uses:

### Panel entry point

- `/usr/local/bin/kiwipanel`: This is the "root" binary (written in bash) file of KiwiPanel. Actually it is a wrapper only. You can find the source code of the wrapper at [kiwipanel/scripts/wrapper](https://github.com/kiwipanel/install/releases), inside the folder `kiwipanel-scaffold.zip`. This bash script is used to start and stop the KiwiPanel web service and the KiwiPanel agent. Sometimes you might use this binary to fix the permissions of the KiwiPanel binary file (written in Golang), if any. Normally everything is fine. Below is a portion of the `kiwipanel` bash script:

```bash
#!/bin/bash
set -euo pipefail

REAL_BIN="/opt/kiwipanel/bin/kiwipanel"
BASE_DIR="/opt/kiwipanel"

# Executes the KiwiPanel binary with the provided arguments
exec "$REAL_BIN" "$@"
```

### `/opt/kiwipanel`

This is the core directory where KiwiPanel is installed.

```text
/opt/kiwipanel/
├── bin/          # the panel and agent Go binaries (root:root, 0755)
├── config/       # kiwipanel.toml and OpenLiteSpeed configuration
├── data/         # SQLite database and pre-update database backups
├── logs/         # panel-managed logs (install.log lives here)
├── meta/         # passcode, terminal/support tokens, version pointers
├── scripts/      # root-executed helper scripts (mariadb, lsws, ...)
├── ssl/          # panel TLS certificate and key
└── templates/    # OpenLiteSpeed vhost templates
```

::: warning Only some subdirectories are panel-writable
`bin`, `scripts`, and `templates` are `root:root` and are **not** writable by the panel. A compromised panel cannot replace its own binary. `config`, `data`, `logs`, and `meta` are `kiwipanel:kiwisecure` and are intentionally writable.
:::

- `/opt/kiwipanel/ssl/panel`: Contains the SSL certificate files. After installing you will get two files: `kiwipanel.key` and `kiwipanel.crt`. These files are used to secure the panel and this is a self-signed certificate (`IP:8443`).
- `/opt/kiwipanel/backups`: Website backup archives written by the root agent, organised as `<website_id>/`, plus `runs/` (run status), `.staging/`, and `vhconf/` (OpenLiteSpeed configuration snapshots).
- `/opt/kiwipanel/data/update-backups`: Verified pre-update database backups created by the updater.

### `/usr/local/lsws`

This is the location of LiteSpeed Web Server (LSWS) on your VPS. LSWS is the web server that KiwiPanel uses to serve the web interface and your websites.

- `/usr/local/lsws/conf/httpd_config.conf`: This is the default configuration file for LiteSpeed Web Server (LSWS). It contains the settings for the web server, such as the listening port, the document root, and the SSL certificate. During the process of installation, KiwiPanel will modify this file to include the necessary settings for the web server. At the bottom of this file, you will find the following lines:

```bash
# =========================================================
# KiwiPanel include (DO NOT REMOVE)
# =========================================================
include /opt/kiwipanel/config/lsws/config/kiwipanel.conf
```

It fundamentally means KiwiPanel will include the configuration file for LSWS in the main configuration file and OVERWRITE/APPEND that configuration at a new file located at `/opt/kiwipanel/config/lsws/config/kiwipanel.conf`.

In case you care about this design, have a look at `https://github.com/kiwipanel/kiwipanel/blob/main/kiwipanel/config/lsws/config/kiwipanel.conf` or on our VPS run `cat /opt/kiwipanel/config/lsws/config/kiwipanel.conf` to see the content of this configuration. Basically it includes two other configuration files:

```text
include /opt/kiwipanel/config/lsws/config/virtualhosts.conf
include /opt/kiwipanel/config/lsws/config/listeners.conf
```

#### Listeners

First, the `include /opt/kiwipanel/config/lsws/config/listeners.conf` has the following content:

```bash
# =========================================================
# KiwiPanel-managed HTTP listener
# =========================================================
listener HTTP {
    address *:80
    secure  0
    map KiwiPanel *
}

# =========================================================
# KiwiPanel-managed HTTPS listener
# =========================================================
listener HTTPS {
    address *:443
    secure  1
    keyFile /opt/kiwipanel/ssl/panel/kiwipanel.key
    certFile /opt/kiwipanel/ssl/panel/kiwipanel.crt
    map KiwiPanel *
}
```

It sets the port for the HTTP listener to 80 (instead of 8088 as default by OpenLiteSpeed) and adds an HTTPS listener on 443 using the panel certificate. Both are mapped to the `KiwiPanel` virtual host, which is defined in `virtualhosts.conf`.

#### Virtual hosts

Second, the file `include /opt/kiwipanel/config/lsws/config/virtualhosts.conf` has the following content:

```bash
# =========================================================
# Virtual Host: Default IP
# =========================================================

virtualHost KiwiPanel {
    vhRoot         /opt/kiwipanel/config/lsws/vhosts/KiwiPanel
    configFile     /opt/kiwipanel/config/lsws/vhosts/KiwiPanel/vhconf.conf
    allowSymbolLink 1
    enableScript    1
    restrained      1
}
```

It sets config for the virtualHost `KiwiPanel`, whose configuration turns out to be located at `/opt/kiwipanel/config/lsws/vhosts/KiwiPanel/vhconf.conf`. `vhRoot` simply means the root directory of the virtual host.

The file `/opt/kiwipanel/config/lsws/vhosts/KiwiPanel/vhconf.conf` has the following content:

```bash
# This is the root directory of the virtual host. Inside this folder we have an index.html file.
# The content of this file is shown when you visit the IP of the VPS.
docRoot /home/kiwiweb/default_site/
enableGzip 1

context / {
  allowBrowse 1
  rewrite  {
    RewriteFile .htaccess
  }
}

index {
  autoIndexURI /_autoindex/default.php
  indexFiles index.html
  autoIndex 0
  useServer 0
}
```

Now you might realize that the `vhRoot` is the root directory of the virtual host, and the `configFile` is the configuration file for the virtual host. We have successfully changed the default port to 80 and mapped it to KiwiPanel, and the html directory is located at `/home/kiwiweb/default_site/`.

### `/etc/kiwipanel`

- `/etc/kiwipanel/secrets.env`: The environment file holding KiwiPanel's MariaDB credentials (`DB_PASS`, `MARIADB_ROOT_PASSWORD`, and the application account). It is `root:root` mode `0600`. The privileged agent reads it; the panel is denied access by design.

::: danger Never edit or share this file
Credential regeneration requires a fresh installation. Rotating a value here without updating MariaDB will silently break every database operation the panel performs.
:::

### `/var/lib/kiwipanel`

This holds runtime state for the panel, the agent, the installer, and the update service. Only `panel-state` and `uploads` are inside the panel's systemd `ReadWritePaths` allowlist; every other entry is written by the root agent, the root installer, or the root update service.

```text
/var/lib/kiwipanel/                # root:kiwisecure 0751
├── panel-state/                   # kiwipanel:kiwisecure 0750 — runtime secrets
│   ├── csrf.key                   # 32-byte CSRF key (0600)
│   ├── data.key                   # 32-byte AES-256-GCM key (0600)
│   └── last_check                 # update-check throttle (15-minute TTL)
├── uploads/                       # kiwipanel:kiwisecure 0770 — TUS upload payloads
├── install.d/                     # root:root 0700 — installer state, MariaDB quarantine
├── terminal-bin/                  # root:root 0755 — curated command symlinks (website terminal PATH)
├── watchdog/                      # kiwipanel:kiwisecure 0750 — created by the agent, currently unused
├── backups/                       # root:root 0755 — MariaDB logical dumps
│   └── mariadb/
├── provisioning-operations/       # root 0700 — durable operation journals (created lazily)
├── vhconf-CRITICAL                # marker file, present only when the OLS vhconf is corrupt
└── update/                        # root:kiwisecure 0750 — update lifecycle state
    ├── status.json                # root-written, panel-readable UI status (0640)
    ├── release-provenance.json    # root-authored signed-release provenance
    └── trusted/                   # root:root 0700 — verified staged binaries
        └── stages/
```

::: tip Why is the parent directory mode `0751`?
The installer creates the tree with `chmod 750`, but the agent adds the "other" execute bit so the resulting mode is `0751`. Website terminal users are neither the owner (`root`) nor in the `kiwisecure` group, so they need traverse permission to reach `terminal-bin/` — while still being unable to list the directory contents.
:::

::: info Some paths appear only after first use
`backups/`, `backups/mariadb/`, `provisioning-operations/`, and `vhconf-CRITICAL` are created lazily. They will not exist on a freshly installed server until the corresponding feature runs for the first time.
:::

#### Runtime secrets in `panel-state`

| File | Purpose | Safe to delete? |
|------|---------|-----------------|
| `csrf.key` | 32-byte key authenticating CSRF tokens. Auto-created at first start, auto-rotated once if a known-compromised value is detected. | Yes — outstanding form tokens are rejected until users reload. Recreated automatically. |
| `data.key` | 32-byte AES-256-GCM key encrypting stored database passwords (`databases.db_password_enc`). Unlike the CSRF key it has **no rotation and no development fallback**: an unsafe or unreadable path is fatal at startup. | **Never.** Deleting it permanently strands every stored database credential. Back it up together with the SQLite database. |
| `last_check` | Update-check throttle timestamp (15-minute TTL). | Yes — only forces an immediate update re-check. |

::: danger Back up `data.key` with the database
Restoring `/opt/kiwipanel/data/kiwipanel.db` without `panel-state/data.key` leaves every stored database password undecryptable. Ciphertext is only recoverable with the exact key that produced it.
:::

#### Update status file

The updater writes progress to `/var/lib/kiwipanel/update/status.json`, which the dashboard reads. It is informational only and is never an input to a privileged operation.

```bash
root@kiwipanel:~# cat /var/lib/kiwipanel/update/status.json
{
  "state": "available",
  "message": "Update available: 0.9.07",
  "time": "2026-10-10T09:00:33Z"
}
```

The `state` field moves through the update lifecycle: `idle`, `checking`, `available`, `downloading`, `ready`, `installing`, `validating`, `verifying`, and `error`. Later entries may also carry `attempt_id` and a `security` object with `preflight`, `candidate`, `rollback`, and `final` checkpoints. See [Updating KiwiPanel](./vitepress_update) for the full lifecycle.

### Logs

- MariaDB installation log: `/var/log/kiwipanel-install.log` (written by `/opt/kiwipanel/scripts/mariadb`)
- MariaDB server error log: `/var/log/mysql/error.log` (distribution default)
- Panel installation log: `/opt/kiwipanel/logs/install.log`
- Panel and agent service logs: `journalctl -u kiwipanel -u kiwipanel-agent`

## See also

- [Updating KiwiPanel](./vitepress_update) — update lifecycle, staging layout, and provenance
- [Backups](./backup) — website backup layout under `/opt/kiwipanel/backups`
- [Diagnostics](./diagnostics) — permission and integrity checks for these directories
- [Website Terminal](./terminal) — how `terminal-bin/` forms the restricted `PATH`
