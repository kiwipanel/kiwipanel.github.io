# PHP Version Management

KiwiPanel lets you manage each installed PHP version from a single page. Monitor worker processes, tune LSAPI performance, edit php.ini directives, manage extensions, and view logs — all from **Settings &rarr; Services &rarr; PHP X.Y**.

Navigate to **Settings &rarr; Services** and click on a PHP version to open the management page.

::: tip
This page manages **server-wide** settings that affect all websites using a given PHP version. For per-website PHP settings (memory limit, error handling, open_basedir, etc.), see [PHP Settings](/website/phpsetting).
:::

---

## Tabs Overview

The PHP management page has six tabs:

| Tab | Purpose |
|-----|---------|
| **Service** | Binary status, active worker processes, memory usage |
| **Extensions** | Install, remove, and view PHP extensions |
| **Configuration** | Edit php.ini directives (resource limits, OPcache, sessions, etc.) |
| **LSAPI Tuning** | OpenLiteSpeed LSAPI performance settings |
| **phpinfo** | Full `phpinfo()` output for this PHP version |
| **Logs** | Recent PHP error log entries |

---

## Service

The Service tab shows real-time status for the selected PHP version:

- **Binary path** — where the lsphp binary is located (e.g., `/usr/local/lsws/lsphp84/bin/lsphp`)
- **Active workers** — number of running lsphp processes
- **Total memory** — combined memory usage of all workers
- **Websites using** — how many websites are configured to use this version

### Worker Processes Table

Each active worker is listed with:

| Column | Description |
|--------|-------------|
| PID | Process ID |
| Memory | RSS memory usage |
| CPU | Current CPU percentage |
| Uptime | How long the process has been running |

### Restart Workers

Click **Restart Workers** in the top-right corner to kill all lsphp processes for this version. OpenLiteSpeed will respawn them on the next request. Use this after making configuration changes or if workers are misbehaving.

::: warning
Restarting workers terminates in-flight PHP requests. Do this during low-traffic periods.
:::

---

## Extensions

View all available and installed extensions for this PHP version.

Each extension shows:

| Badge | Meaning |
|-------|---------|
| **Bundled** (green) | Built into PHP core — cannot be removed |
| **Installed** (blue) | Installed via package manager — can be removed |
| **Available** (gray) | Not installed — can be installed |

### Installing an Extension

1. Find the extension in the list
2. Click **Install**
3. Wait for the package installation to complete
4. The extension is immediately available (workers restart automatically)

### Removing an Extension

1. Find the installed extension
2. Click **Remove**
3. Confirm the removal

::: info
Extension management uses the system package manager (`apt` on Debian/Ubuntu, `dnf` on RHEL/AlmaLinux). The extension packages follow the naming convention `lsphpXY-{ext}` (e.g., `lsphp84-redis`).
:::

### Commonly Needed Extensions

| Extension | Use Case |
|-----------|----------|
| gd / imagick | Image processing (WordPress thumbnails, etc.) |
| intl | Internationalization (number/date formatting) |
| mbstring | Multibyte string handling (UTF-8, CJK) |
| redis | Redis caching (WordPress object cache, Laravel) |
| curl | HTTP requests to external APIs |
| zip | Archive handling |
| bcmath | Precise math (e-commerce, financial apps) |
| soap | SOAP web services |

---

## Configuration

Edit PHP directives that apply server-wide to all websites running this PHP version.

The Configuration tab has two modes:

- **Form mode** (default) — organized settings with dropdowns and inputs
- **Raw mode** — direct ini file editing with syntax highlighting (Ace editor)

Toggle between modes using the **Form / Raw** switch in the top-right corner.

::: danger
Raw mode changes can break PHP for all websites using this version. Always prefer form mode unless you need directives not available in the form.
:::

### Resource Limits

| Directive | Default | Description |
|-----------|---------|-------------|
| `memory_limit` | 256M | Maximum memory per script. Increase for heavy applications. |
| `max_execution_time` | 30 | Maximum seconds before a script is killed. |
| `max_input_time` | 60 | Maximum seconds to parse request data. |
| `max_input_vars` | 1000 | Maximum number of input variables. Increase for complex forms. |

### File Upload

| Directive | Default | Description |
|-----------|---------|-------------|
| `upload_max_filesize` | 64M | Maximum size of a single uploaded file. |
| `post_max_size` | 64M | Maximum size of the entire POST body. Must be &ge; `upload_max_filesize`. |
| `max_file_uploads` | 20 | Maximum simultaneous file uploads per request. |
| `file_uploads` | On | Enable or disable file uploads entirely. |

### Error Handling

| Directive | Default | Description |
|-----------|---------|-------------|
| `display_errors` | Off | Show errors on web pages. **Never enable in production.** |
| `display_startup_errors` | Off | Show errors during PHP startup. |
| `error_reporting` | `E_ALL & ~E_DEPRECATED & ~E_STRICT` | Which error types to report. |
| `log_errors` | On | Write errors to the log file. |
| `error_log` | `/var/log/lsws/php_error.log` | Path to the error log file. |

### Session

| Directive | Default | Description |
|-----------|---------|-------------|
| `session.gc_maxlifetime` | 1440 | Seconds before session data expires (24 minutes). |
| `session.cookie_lifetime` | 0 | Cookie lifetime. `0` = expires when browser closes. |
| `session.save_handler` | files | Session storage backend. |
| `session.save_path` | `/var/lib/php/sessions` | Directory for session files. |

### OPcache

OPcache dramatically improves PHP performance by caching compiled bytecode in shared memory.

| Directive | Default | Description |
|-----------|---------|-------------|
| `opcache.enable` | 1 | Enable the opcode cache. **Always keep enabled in production.** |
| `opcache.memory_consumption` | 128 | Memory allocated for caching (MB). Must not exceed 75% of total server RAM. |
| `opcache.max_accelerated_files` | 10000 | Maximum number of PHP files to cache. Increase for large codebases. |
| `opcache.validate_timestamps` | 1 | Check if files changed since caching. Disable for maximum performance on production. |
| `opcache.revalidate_freq` | 2 | How often (seconds) to check for file changes when `validate_timestamps` is on. |

::: warning OPcache Memory Limit
KiwiPanel validates that `opcache.memory_consumption` does not exceed 75% of your server's total RAM. Setting it too high can OOM-crash all lsphp processes. On a 2GB VPS, the maximum is 1536MB.
:::

::: tip OPcache for Production
For maximum performance on production servers where you deploy code via git/CI (not editing files live):
```
opcache.validate_timestamps = 0
opcache.revalidate_freq = 0
```
Then restart workers after each deployment to pick up new code.
:::

### Date / Timezone

| Directive | Default | Description |
|-----------|---------|-------------|
| `date.timezone` | UTC | Default timezone for `date()`, `strtotime()`, etc. |

### Security & Disabled Functions

This section shows security directives and the current `disable_functions` list. The active security preset badge (Standard, Relaxed, None, Custom) is displayed in the card header.

| Directive | Default | Description |
|-----------|---------|-------------|
| `expose_php` | Off | Hide `X-Powered-By` header. Keep Off to prevent version fingerprinting. |
| `allow_url_fopen` | On | Allow `fopen()` to access URLs. Required by many frameworks. |
| `allow_url_include` | Off | Allow `include()` to load remote URLs. **Never enable** — major RCE vector. |
| `disable_functions` | *(preset)* | Comma-separated list of blocked PHP functions. |

::: info
The `disable_functions` list on this page shows the value from the global drop-in ini. The **security preset** (Standard, Relaxed, None, Custom) configured at [Settings &rarr; PHP Security](./phpsecurity) takes precedence via a separate drop-in file that loads after this one. To change the preset, go to **Settings &rarr; PHP Security**.
:::

### How Configuration Is Stored

KiwiPanel writes global PHP configuration to a drop-in ini file in the PHP scan directory:

```
RHEL/AlmaLinux:  /usr/local/lsws/lsphp84/etc/php.d/00-kiwipanel.ini
Debian/Ubuntu:   /usr/local/lsws/lsphp84/etc/php/8.4/mods-available/00-kiwipanel.ini
```

The `00-` prefix ensures it loads **first** in the scan directory, before:
- `10-opcache.ini` (distro OPcache defaults)
- `20-kiwipanel-security.ini` (security directives from PHP Security page)

Security-managed directives (`disable_functions`, `expose_php`, `allow_url_include`) in `00-kiwipanel.ini` are overridden by the security drop-in (`20-kiwipanel-security.ini`) which loads later.

::: details Why not php.ini?
OpenLiteSpeed's lsphp processes do not load the main `php.ini` file. They only read from the scan directory (`php.d/` or `mods-available/`). KiwiPanel writes to a drop-in ini file in the scan directory to ensure directives actually take effect for web requests.

The CLI `php` command does load `php.ini`, so `php -i` may show different values than what your websites use. Always verify settings via a web-accessible `phpinfo()` page.
:::

---

## LSAPI Tuning

LSAPI (LiteSpeed Server Application Programming Interface) controls how OpenLiteSpeed communicates with PHP processes. These settings affect performance, concurrency, and resource usage.

::: info
These are **default values** for new websites. Click **Apply to All** to update existing websites using this PHP version.
:::

### Worker Processes

| Setting | Default | Description |
|---------|---------|-------------|
| Max Connections | 35 | Maximum concurrent connections to the PHP backend. |
| LSAPI Children | 35 | Number of PHP child processes per website. Higher values handle more concurrent requests but use more RAM. |
| LSAPI Avoid Fork | 200M | Memory threshold before OLS avoids forking new PHP processes. |

::: tip Sizing PHP Workers
A rough formula: each PHP worker uses ~30-80MB of RAM depending on your application. On a 2GB VPS:
- Conservative: 10-15 children
- Moderate: 20-25 children
- Aggressive: 30-35 children

Monitor actual memory usage in the Service tab and adjust accordingly.
:::

### Timeouts

| Setting | Default | Description |
|---------|---------|-------------|
| Init Timeout | 60 sec | Maximum time to wait for a new PHP process to start. |
| Retry Timeout | 0 sec | Delay before retrying a failed connection to PHP. |
| Keep-Alive Timeout | 15 sec | How long to keep an idle persistent connection alive. |

### Memory Limits

| Setting | Default | Description |
|---------|---------|-------------|
| Soft Limit | 0 MB | Memory threshold that triggers a graceful restart of the PHP process. `0` = no limit. |
| Hard Limit | 0 MB | Absolute memory cap — the process is killed immediately if exceeded. `0` = no limit. |

### Process Limits

| Setting | Default | Description |
|---------|---------|-------------|
| Proc Soft Limit | 400 | Soft limit on number of processes. |
| Proc Hard Limit | 500 | Hard limit — new processes are rejected beyond this. |

### Other

| Setting | Default | Description |
|---------|---------|-------------|
| Persist Connection | On | Keep connections to PHP processes alive between requests. **Keep enabled** for performance. |
| Response Buffer | Off | Buffer the full response before sending to the client. |
| Auto Start | 2 | How OLS starts PHP processes (0=off, 1=on, 2=detect, 3=always). |
| Backlog | 100 | Maximum pending connection queue length. |
| Instances | 1 | Number of PHP backend instances. Usually 1 is sufficient. |
| Run On Startup | 3 | Pre-start PHP processes when OLS starts. |

---

## phpinfo

Displays the full `phpinfo()` output for this PHP version in an iframe. This shows:

- Loaded configuration files
- All active directives and their values
- Installed extensions with their settings
- Environment variables
- HTTP headers

::: tip
Use this tab to verify that configuration changes from the Configuration tab are actually taking effect. Look for your directive in the "Core" or relevant extension section.
:::

---

## Logs

Shows recent PHP error log entries for this version. The log file path depends on the `error_log` directive in the Configuration tab (default: `/var/log/lsws/php_error.log`).

Use this tab to:
- Debug PHP errors without SSH access
- Check for deprecation warnings after a PHP upgrade
- Spot security-related warnings

---

## Global vs Per-Website Settings

Understanding which settings apply where:

| Scope | What it controls | Where to configure |
|-------|------------------|--------------------|
| **Global (this page)** | Server-wide php.ini defaults, OPcache tuning, LSAPI performance, extensions | Settings &rarr; Services &rarr; PHP X.Y |
| **Global security** | `disable_functions`, `expose_php`, `allow_url_include`, session hardening, chroot | [Settings &rarr; PHP Security](./phpsecurity) |
| **Per-website** | `memory_limit`, `max_execution_time`, upload sizes, error handling, `open_basedir` | [Websites &rarr; (site) &rarr; PHP](/website/phpsetting) |

**Precedence order** (later overrides earlier):

```
php.ini (OS defaults)
  ↓
00-kiwipanel.ini (global config — this page)
  ↓
10-opcache.ini (distro OPcache defaults)
  ↓
20-kiwipanel-security.ini (security presets)
  ↓
OLS vhost phpIniOverride (per-website settings)
  ↓
.user.ini (user overrides — limited to PHP_INI_USER)
```

::: info PHP_INI_SYSTEM vs PHP_INI_ALL
Directives marked `PHP_INI_SYSTEM` (like `opcache.memory_consumption`, `disable_functions`) can only be set at the server level — they are read once when lsphp starts and cannot be overridden per-website.

Directives marked `PHP_INI_ALL` or `PHP_INI_PERDIR` (like `memory_limit`, `display_errors`) can be overridden per-website via the website's PHP settings page.
:::

---

## Troubleshooting

### Changes not taking effect

1. After saving, KiwiPanel kills lsphp workers so they restart with the new config. If values still look old, click **Restart Workers** manually.
2. Check the **phpinfo** tab to verify the directive shows the expected value.
3. If `phpinfo` shows the old value, the directive may be overridden by a later-loading ini file or per-website setting. Check the "Configuration File (php.ini) Path" and "Additional .ini files parsed" sections in phpinfo.

### OPcache memory rejected

KiwiPanel limits `opcache.memory_consumption` to 75% of total server RAM to prevent OOM crashes. If you need more, consider upgrading your server's RAM.

### Extensions fail to install

1. Check that your server has internet access
2. The LiteSpeed PHP repository must be configured. KiwiPanel sets this up during installation.
3. On RHEL/AlmaLinux, run `dnf module disable php` first — the default PHP module can filter out `lsphp*` packages.

### Worker memory keeps growing

PHP workers can accumulate memory over time (memory leaks in application code or extensions). Set a **Memory Soft Limit** in the LSAPI Tuning tab to automatically recycle workers that exceed the threshold.

### phpinfo shows different values than CLI

This is expected. The CLI `php` command loads `php.ini` directly, while web-facing lsphp processes load from the scan directory. Always trust the phpinfo output from the **phpinfo** tab (or a web-accessible `phpinfo()` page) — that shows what your websites actually see.
