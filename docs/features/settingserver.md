---
title: Server Settings
description: Manage hostname, timezone, NTP, DNS, swap, system updates and power controls from a single page.
outline: deep
---

# Server Settings

`Settings → Server` (`/settings/server`) is the single page where panel
administrators manage everything that lives at the **operating system / host**
layer rather than at the panel application layer. Each card on this page
mutates a real Linux subsystem (`systemd-hostnamed`, `systemd-timesyncd`,
`/etc`, swap, `apt`/`dnf`, …), so every save goes through the kiwipanel
**agent** (running as `root`) and — for the destructive ones — through the
**S0 Dangerous Change** confirmation flow.

::: info Source files
- Template — `html/template/themes/backend/pages/settings/system.html`
- Agent handlers — `internal/agent/system_*.go`
- Panel transport — `internal/modules/settings/transport/http/system.go`
:::

## Cards on this page

| #  | Card | Mutates | Reboot? | S0 confirm |
|----|------|---------|:-------:|:----------:|
| 1  | **Hostname**       | `/etc/hostname`, `/etc/hosts`, `hostnamectl`                                                                 | ❌ | ✅ |
| 2  | **Timezone**       | `/etc/localtime`, `/etc/timezone`, every `lsphp` `00-kiwipanel.ini`, every vhost config, every chroot, lsphp | ❌ | ❌ |
| 3  | **Kernel & Uptime**| read-only: `uname`, `/proc/uptime`, `/proc/loadavg`, `/var/run/reboot-required`, `dpkg-query linux-image-*`  | ❌ | ❌ |
| 4  | **System Locale**  | `localectl set-locale LANG=…` or `/etc/default/locale`                                                       | ❌ | ❌ |
| 5  | **NTP Time Sync**  | `/etc/systemd/timesyncd.conf`, `systemd-timesyncd` / `chrony`                                                | ❌ | ❌ |
| 6  | **DNS Resolver**   | `/etc/resolv.conf` (or `systemd-resolved`), `/etc/systemd/resolved.conf`                                     | ❌ | ✅ |
| 7  | **Swap Memory**    | `/swapfile`, `/etc/fstab`, `vm.swappiness`                                                                   | ❌ | ✅ |
| 8  | **System Updates** | `apt` / `dnf`, kernel                                                                                        | ⚠️ | ✅ |
| 9  | **Reboot / Shutdown** | `systemctl reboot` / `poweroff`                                                                          | ✅ | ✅ |

::: tip Live clock
The Timezone card includes a **live clock** that updates every second using
the browser's `Intl.DateTimeFormat` with the currently selected IANA zone.
The clock re-renders when the dropdown changes, so you can preview another
zone's wall-clock time before clicking Save. It never hits the server — it is
pure JS, so picking an invalid zone is a no-op.
:::

## Hostname

Sets the FQDN that the kernel and every daemon report.

- **Field** — `Server Hostname`. Must satisfy [RFC 1123](https://datatracker.ietf.org/doc/html/rfc1123): `[a-z0-9.-]`, max 253 chars.
- **Effect** — writes `/etc/hostname`, updates the matching line in `/etc/hosts`, invokes `hostnamectl set-hostname`, and reloads any service that caches the hostname.
- **Verify** — `hostname -f`, `hostnamectl`.

::: warning Re-issue TLS certs
If LSWS or MariaDB embeds the old hostname in a TLS cert, those certs must be re-issued separately.
:::

## Timezone

Picks an IANA timezone (e.g. `Asia/Ho_Chi_Minh`, `America/New_York`).
KiwiPanel fans the change out across **five layers atomically** so every PHP
request — including those running inside chroot jails — sees the new
wall-clock immediately.

::: danger Always change the timezone through the KiwiPanel UI
The server timezone **must be changed through the KiwiPanel UI**
(`Settings → Server → Timezone`).

Changing the timezone directly via `timedatectl set-timezone` will update the
OS clock but **will not propagate** to PHP or OpenLiteSpeed. This is because
the panel performs additional steps when saving the timezone:

- Updates `date.timezone` in all LSPHP ini files
- Removes stale per-vhost timezone overrides
- Refreshes chroot jail timezone files
- Reloads OpenLiteSpeed and restarts LSPHP workers


A future release may add automatic detection and propagation of OS-level
timezone changes.
:::

::: tip Why a single `timedatectl` is not enough
PHP reads its timezone from up to three places that can each lag the OS:

1. The `date.timezone` directive in any `*.ini` loaded by the SAPI.
2. A per-vhost `php_value date.timezone …` line inside the LSWS `phpIniOverride { … }` block.
3. The `etc/localtime` file **inside the chroot jail** (PHP falls back to it when `date.timezone` is empty).

On top of that, long-running `lsphp` workers cache the resolved zone in memory until they're killed.
KiwiPanel's `propagateTimezone()` (in `internal/agent/system_timezone.go`) walks all three layers and then evicts the workers.
:::

### Propagation pipeline

When you click **Save**, the agent runs the following in order:

1. `timedatectl set-timezone <TZ>` — sets the host clock.
2. `ln -sf /usr/share/zoneinfo/<TZ> /etc/localtime` and writes `/etc/timezone`
   (Debian/Ubuntu still reads the latter).
3. For every installed `lsphp{XX}/etc/php/<ver>/mods-available/00-kiwipanel.ini`:
   - rewrites the `date.timezone = <TZ>` line, and
   - re-applies mode `0644` via `writeSecurityIni()` so `systemd UMask=0027`
     cannot downgrade the file to `0640` (which would make `lsphp` unable to
     read it).
4. For every per-vhost LSWS file under
   `/opt/kiwipanel/config/lsws/vhosts/*/vhconf.conf`, strips any stale
   `php_value date.timezone …` line that an older version of the panel had
   injected into the `phpIniOverride { … }` block.
5. For every chroot jail under `/home/<user>/<site>/`:
   - copies `/usr/share/zoneinfo/<TZ>` to `<jail>/etc/localtime`, mode `0644`;
   - writes `<TZ>` into `<jail>/etc/timezone`, mode `0644`.
6. `lswsctrl reload` for a graceful HUP, then `pkill -9 lsphp` to evict cached
   workers.

::: details Why `pkill -9` after a graceful reload?
LSWS' `SIGUSR1` reload re-reads its own config but keeps existing `lsphp`
children alive so in-flight requests don't drop. Those children already cached
the old timezone at start-up. Without `pkill -9`, the next request still hits
the old tz until the workers naturally recycle. The kill is safe because OLS
immediately respawns workers on the next request.
:::

### Verifying

::: code-group

```php [PHP test page]
<?php
echo 'Timezone: ', date_default_timezone_get(), '<br>';
echo 'Current time: ', date('Y-m-d H:i:s'), '<br>';
echo 'Offset: ', date('P');
```

```bash [Shell spot-checks]
# Host
timedatectl | grep 'Time zone'
cat /etc/timezone

# PHP drop-ins (perms must be 0644, value must match)
ls -l /usr/local/lsws/lsphp*/etc/php/*/mods-available/00-kiwipanel.ini
grep -H date.timezone /usr/local/lsws/lsphp*/etc/php/*/mods-available/00-kiwipanel.ini

# No stale per-vhost overrides
grep -rn 'date\.timezone' /opt/kiwipanel/config/lsws/vhosts/ || echo "clean"

# Chroot jails
for d in /home/*/*/etc/timezone; do
  echo "$(dirname "$(dirname "$d")") -> $(cat "$d")"
done
```

:::

::: tip
All five layers must report the same IANA name. If any layer diverges, that is a bug worth filing.
:::

### Self-healing for already-broken servers

Servers that were upgraded over an older buggy build may still have:

- `00-kiwipanel.ini` with `0640` perms,
- stale `php_value date.timezone UTC` overrides in vhost configs,
- chroot jails missing `etc/localtime` entirely.

The recommended fix is to simply re-save the timezone from
`Settings → Server → Timezone` in the panel UI — `propagateTimezone()`
(in `internal/agent/system_timezone.go`) is fully idempotent and will
re-apply the correct perms on `00-kiwipanel.ini`, strip stale per-vhost
`date.timezone` overrides, and refresh every chroot jail's `etc/localtime`.

::: tip Per-script workaround
If you need an immediate fix for a single PHP script while you sort out
the system-wide propagation, add this line to the very top of the script:

```php
<?php
date_default_timezone_set('UTC'); // or 'Asia/Ho_Chi_Minh', etc.
```

This only affects that one script's process and does **not** replace
fixing the panel/OS configuration — it's just a temporary escape hatch.
:::

## Kernel & Uptime

Read-only card that shows the running kernel, when the machine last booted,
the current load average, and whether a reboot is pending.

| Field | Source |
|-------|--------|
| Kernel release   | `uname -r` |
| Kernel version   | `uname -v` |
| Boot time        | `now - /proc/uptime[0]` (UTC, RFC 3339) |
| Uptime           | `/proc/uptime` (first field, seconds) |
| Load average     | `/proc/loadavg` (1 / 5 / 15 min) |
| Reboot required  | presence of `/var/run/reboot-required` (Debian/Ubuntu) |
| Pending kernel pkgs | `dpkg-query -W 'linux-image-*'` filtered to versions **newer** than the running release using a Debian-style natural version compare |

**Badges**

- 🔴 **Reboot required** — shown whenever `/var/run/reboot-required` exists.
- 🟡 **Kernel update pending** — shown when uptime > **90 days** *and* at
  least one installed `linux-image-*` package is newer than the running
  kernel. The threshold is deliberately conservative: panels don't nag on
  every fresh boot.

**Endpoint** — `GET /v1/system/kernel` (agent) → proxied at
`GET /settings/server/kernel`. Pure read-only; safe to poll.

::: info RHEL family
The `rpm -qa kernel` path is stubbed — it returns an empty pending list on
RHEL/Alma/Rocky. Contributions welcome; the version-compare helper
(`kernelVersionLess` in `internal/agent/system_kernel.go`) already handles
mixed numeric/alpha tokens.
:::

## System Locale

Sets the system-wide `LANG` used by new shells and services.

- **Field** — `Default locale (LANG)`, populated from `localectl list-locales`
  (falls back to `/usr/share/i18n/SUPPORTED` filtered to UTF-8 entries).
- **Effect** — agent calls `localectl set-locale LANG=<val>`. On systems
  without `localectl`, rewrites `/etc/default/locale`, preserving every line
  that isn't `LANG=`.
- **Scope** — does **not** change locales of already-running processes
  (systemd units, `lsphp`, `sshd`). Restart the unit or open a new shell to
  pick up the change.
- **Verify** — `locale`, `localectl status`, `cat /etc/default/locale`.

**Endpoints** — `GET` + `POST /v1/system/locale` (agent) → proxied at
`GET` / `POST /settings/server/locale`. The POST validates the requested
value against the available list before applying.

## NTP Time Sync

Picks the NTP server and shows live drift/offset from
`timedatectl timesync-status`.

- **Field** — `NTP Server` (hostname or IP).
- **Effect** — rewrites `/etc/systemd/timesyncd.conf` (key `NTP=`) and
  restarts `systemd-timesyncd` (or `chrony` if installed).
- **Indicators** — “Synchronized” / “Not Synchronized” badges + “Time Sync
  Active” status dot.
- **Verify** — `timedatectl show-timesync | grep -E 'ServerName|LastRoot'`.

::: warning Firewall
NTP is UDP/123. If `Settings → Firewall` blocks outbound UDP/123, the badge stays "Not Synchronized" forever.
:::

## DNS Resolver

Sets system-wide nameservers with one-click presets (Cloudflare `1.1.1.1`,
Google `8.8.8.8`, Quad9 `9.9.9.9`) plus a Custom mode.

- **Effect** — writes `/etc/systemd/resolved.conf` (`DNS=`) and restarts
  `systemd-resolved`. On systems without resolved, edits `/etc/resolv.conf`
  directly.
- **Verify** — `resolvectl status` or `cat /etc/resolv.conf`.

::: danger Lock-out risk
DNS misconfig is the single fastest way to lose `apt update` /
Let's Encrypt renewal / mail delivery. The Save button always goes through the
S0 Dangerous Change flow with a 30 s auto-revert timer — if you can no longer
reach the panel after the change, do nothing and the previous resolvers come
back.
:::

## Swap Memory

Creates / resizes / removes the system swapfile and tunes `vm.swappiness`.

::: warning Without swap, the OOM killer wins
On a memory-pressured box with no swap, the kernel's OOM killer will SIGKILL
MariaDB or PHP — usually whichever is currently the largest RSS. The card
shows a dismissable warning when no swap is detected.
:::

**Effect of "Create swap":**

- `fallocate` (or `dd` fallback) a `/swapfile` of the requested size,
- `chmod 600 /swapfile`,
- `mkswap` + `swapon`,
- append to `/etc/fstab` so it persists across reboot,
- optionally update `vm.swappiness` (default `10` on bare metal, `60` in VMs).

**Verify** — `swapon --show`, `free -m`, `cat /proc/sys/vm/swappiness`.

## System Updates

Drives the package manager (`apt-get update && apt-get upgrade -y` on Debian /
Ubuntu, `dnf upgrade -y` on RHEL family) and reports pending package counts
and whether a reboot is required (`/var/run/reboot-required`).

- **Confirm flow** — S0 dangerous change with an optional checkbox to reboot
  when the kernel is updated.
- **Verify** — `apt list --upgradable` / `dnf check-update`.

## Reboot / Shutdown

Hard system controls. Both require:

- the admin's panel passcode (re-prompt),
- an S0 dangerous change confirmation,
- an informational alert listing every active SSH session, MariaDB connection
  and running cron job that will be killed.

## API endpoints

| Verb | Path | Handler |
|------|------|---------|
| `POST` | `/settings/server/hostname` | `setHostname()` — `internal/agent/system_hostname.go` |
| `POST` | `/settings/server/timezone` | `setTimezone()` — `internal/agent/system_timezone.go` |
| `GET`  | `/settings/server/kernel`   | `handleKernel()` — `internal/agent/system_kernel.go` |
| `GET`  | `/settings/server/locale`   | `getLocale()` — `internal/agent/system_locale.go` |
| `POST` | `/settings/server/locale`   | `setLocale()` — `internal/agent/system_locale.go` |
| `POST` | `/settings/server/ntp`      | `setNTPServer()` — `internal/agent/system_ntp.go` |
| `POST` | `/settings/server/dns`      | `setDNS()` — `internal/agent/system_dns.go` |
| `POST` | `/settings/server/swap`     | `setSwap()` — `internal/agent/system_swap.go` |
| `POST` | `/settings/server/updates`  | `runSystemUpdates()` — `internal/agent/system_updates.go` |
| `POST` | `/settings/server/reboot`   | `systemReboot()` — `internal/agent/system_power.go` |

All endpoints are agent-side, gated by `middleware.RequireAdmin` and (where
appropriate) `middleware.DangerousChange`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| PHP still shows old timezone after Save | Old binary did not strip per-vhost overrides; or chroot jail missing `etc/localtime`; or `00-kiwipanel.ini` is `0640` | Re-save the timezone from `Settings → Server → Timezone` (idempotent); as a per-script workaround add `date_default_timezone_set('UTC');` at the top of the affected PHP file |
| Hostname change rejected | New name fails RFC 1123 (uppercase, underscore, > 253 chars) | Use lowercase letters, digits, hyphens, dots only |
| NTP "Not Synchronized" | Outbound UDP/123 blocked by firewall; chosen NTP server unreachable | Open UDP/123 in `Settings → Firewall` and/or pick a closer pool |
| Lost shell after DNS save | Both nameservers unreachable | Wait 30 s — the dangerous-change watchdog auto-reverts |
| Swap create fails with `ENOSPC` | Disk full or filesystem doesn't support `fallocate` | Free disk space; or pick a smaller size; agent will fall back to `dd` |
| Reboot button greyed out | Active terminal session detected | Close the terminal first, or use the "Force" override |
