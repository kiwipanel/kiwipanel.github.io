# PHP Settings

KiwiPanel gives you per-website control over PHP configuration. Each website can have its own PHP version, performance tuning, error handling, and security settings — all managed from one page.

Navigate to **Websites → (your site) → PHP** to access the PHP settings page.

::: tip
Changes take effect immediately after saving. KiwiPanel writes the settings to a per-vhost PHP configuration and reloads the web server — no manual restart needed.
:::

## PHP Version

Each website can run a different PHP version. KiwiPanel detects which versions are installed on your server and shows them in a dropdown.

| Version | Status |
|---------|--------|
| PHP 8.4 | Latest stable |
| PHP 8.3 | Active support |
| PHP 8.2 | Security fixes only |
| PHP 8.1 | End of life |
| PHP 7.4 | End of life |

::: warning
Changing the PHP version restarts the PHP process for that website. Active requests will be terminated. Do this during low-traffic periods.
:::

**To change the PHP version:**

1. Open your website's PHP settings page
2. Select the desired version from the **PHP Version** dropdown
3. Click **Save Settings**

The page will reload and show the new version with its installed extensions.

---

## Settings Overview

PHP settings are organized into five categories on the settings page. Each setting shows its current value, which you can modify directly.

### Resource Limits

Control how much CPU and memory PHP can use per request.

| Setting | Default | Description |
|---------|---------|-------------|
| `memory_limit` | 256M | Maximum memory a single script can consume. Increase for memory-intensive applications (e.g., WordPress with WooCommerce). |
| `max_execution_time` | 30 | Maximum seconds a script can run before being terminated. Increase for long-running tasks like imports or report generation. |
| `max_input_time` | 60 | Maximum seconds PHP will spend parsing request data (POST, GET, file uploads). |
| `max_input_vars` | 1000 | Maximum number of input variables accepted. Increase if you have forms with many fields (e.g., WooCommerce product variations). |

::: tip
For WordPress with WooCommerce, recommended values are:
- `memory_limit`: 512M
- `max_execution_time`: 300
- `max_input_vars`: 5000
:::

### File Upload

Control file upload sizes and limits.

| Setting | Default | Description |
|---------|---------|-------------|
| `upload_max_filesize` | 64M | Maximum size of a single uploaded file. Must be ≤ `post_max_size`. |
| `post_max_size` | 64M | Maximum size of the entire POST body (all files + form data combined). Must be ≥ `upload_max_filesize`. |
| `max_file_uploads` | 20 | Maximum number of files that can be uploaded in a single request. |

::: warning
`post_max_size` must be greater than or equal to `upload_max_filesize`. If `post_max_size` is smaller, uploads will silently fail.
:::

### Error Handling

Control how PHP reports and logs errors.

| Setting | Default | Description |
|---------|---------|-------------|
| `display_errors` | Off | Whether to show errors directly on web pages. **Never enable in production** — error messages can leak sensitive information. |
| `error_reporting` | `E_ALL & ~E_DEPRECATED & ~E_STRICT` | Which types of errors to report. `E_ALL` catches everything; the default skips deprecation and strict notices. |
| `log_errors` | On | Whether to write errors to the website's error log file. Always keep this enabled for debugging. |

**Recommended for development:**

```
display_errors: On
error_reporting: E_ALL
log_errors: On
```

**Recommended for production:**

```
display_errors: Off
error_reporting: E_ALL & ~E_DEPRECATED & ~E_STRICT
log_errors: On
```

### Session

Control PHP session behavior.

| Setting | Default | Description |
|---------|---------|-------------|
| `session.gc_maxlifetime` | 1440 | Seconds before session data is considered garbage and eligible for cleanup. Default is 24 minutes. |
| `session.cookie_lifetime` | 0 | Lifetime of the session cookie in seconds. `0` means the cookie expires when the browser closes. |

### Other

Additional PHP settings for timezone and caching.

| Setting | Default | Description |
|---------|---------|-------------|
| `date.timezone` | UTC | Default timezone for date/time functions. Set this to your target audience's timezone. |
| `opcache.enable` | 1 | Enable PHP's opcode cache. Significantly improves performance by caching compiled PHP scripts. **Always keep enabled in production.** |
| `opcache.memory_consumption` | 128 | Memory allocated for opcode caching in MB. Increase for large applications with many PHP files. |

---

## Installed Extensions

The PHP settings page shows a list of extensions currently installed for your website's PHP version. Extensions are labeled as:

- **core** (green badge) — Built-in extensions that are part of PHP itself (e.g., json, date, pcre). These cannot be removed.
- **ext** (blue badge) — Additional extensions installed via the system package manager (e.g., gd, intl, redis). These can be installed or removed by an administrator.

The extension list is version-specific — PHP 8.3 and PHP 8.4 can have completely different extensions installed.

### Installing New Extensions

Extension management depends on your role:

**If you are an administrator:**

Go to **Settings → Services** to install or remove PHP extensions. Extensions are managed per PHP version — you can install `php8.4-redis` independently from `php8.3-redis`.

**If you are a regular user:**

Contact your server administrator to request extension installation. Let them know:
- Which extension you need (e.g., `gd`, `redis`, `imagick`)
- Which PHP version it should be installed for

### Commonly Used Extensions

| Extension | Package | Description |
|-----------|---------|-------------|
| GD | `phpX.Y-gd` | Image processing (JPEG, PNG, GIF, WebP) |
| Imagick | `phpX.Y-imagick` | Advanced image processing via ImageMagick |
| Intl | `phpX.Y-intl` | Internationalization (number/date formatting, collation) |
| mbstring | `phpX.Y-mbstring` | Multibyte string handling (UTF-8, CJK) |
| MySQL | `phpX.Y-mysql` | MySQL/MariaDB database support |
| PostgreSQL | `phpX.Y-pgsql` | PostgreSQL database support |
| Redis | `phpX.Y-redis` | Redis in-memory data store client |
| cURL | `phpX.Y-curl` | HTTP client for external API calls |
| Zip | `phpX.Y-zip` | ZIP archive creation and extraction |
| BCMath | `phpX.Y-bcmath` | Arbitrary precision mathematics |
| Soap | `phpX.Y-soap` | SOAP web services client/server |
| XML | `phpX.Y-xml` | XML parsing and manipulation |

Replace `X.Y` with your PHP version (e.g., `php8.4-redis`).

---

## Custom Directives

For settings not available in the UI, you can add custom PHP directives directly. These are written as raw `php.ini` syntax and applied to your website's PHP configuration.

```ini
; Example custom directives
realpath_cache_size = 4096k
realpath_cache_ttl = 600
output_buffering = 4096
```

::: warning
Invalid directives may cause PHP to fail. Test changes carefully and check the error log if your website stops working after saving.
:::

::: info
Your administrator may disable custom directives for your account. If the custom directives section is not visible, contact your administrator.
:::

---

## Security Settings

Each website has its own PHP security configuration. These settings provide defense-in-depth protection against common PHP attacks. For a complete guide to PHP security layers, see [PHP Security](../features/phpsecurity).

### disable_functions

Controls which PHP functions are blocked from being called. Three presets are available:

| Preset | Description |
|--------|-------------|
| **Standard** (default) | Blocks dangerous functions like `exec`, `system`, `passthru`, `shell_exec`, `proc_open`, `popen`, `eval`. Best for most websites. |
| **Relaxed** | Allows some functions that standard blocks. Use for applications that need controlled system access (e.g., some WordPress plugins). |
| **None** | No functions are blocked. **Not recommended for production.** |
| **Custom** | Specify your own comma-separated list of disabled functions. |

You can also add individual **allowed functions** to the Standard or Relaxed presets without switching away from them.

### open_basedir

Restricts which directories PHP can access on the filesystem. When enabled, PHP can only read files within the website's home directory and a few system paths.

### Other Security Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `expose_php` | Off | Hides `X-Powered-By: PHP/x.x` header from responses. Keep disabled to avoid leaking version information. |
| `allow_url_include` | Off | Blocks `include()` and `require()` from loading remote URLs. **Never enable this** — it's one of the most exploited PHP misconfigurations. |
| `session.cookie_httponly` | On | Prevents JavaScript from accessing session cookies, mitigating XSS cookie theft. |
| `session.cookie_secure` | On | Session cookies are only sent over HTTPS connections. |
| `session.use_strict_mode` | On | Rejects session IDs not generated by PHP, preventing session fixation attacks. |

### Per-Site Overrides

Security settings are applied globally by default. Administrators can create per-site overrides to customize security for individual websites without affecting others.

To create an override:
1. Open the website's PHP settings
2. Scroll to the Security section
3. Modify the desired settings
4. Click **Save Security Settings**

A badge indicates when a site has custom overrides active. Click **Reset to Defaults** to remove the override and revert to global settings.

---

## How It Works

Under the hood, KiwiPanel manages PHP settings through multiple configuration layers:

```
┌─────────────────────────────────┐
│ php.ini (system-wide defaults)  │  ← Managed by the OS package
├─────────────────────────────────┤
│ mods-available/*.ini            │  ← Security ini (disable_functions, etc.)
├─────────────────────────────────┤
│ OLS vhost phpIniOverride        │  ← Per-site settings (memory_limit, etc.)
├─────────────────────────────────┤
│ .user.ini (user overrides)      │  ← User-created (limited by PHP_INI_USER)
└─────────────────────────────────┘
         ↓ later layers override earlier ones
```

**Important:** Settings applied via `php_admin_value` in the OLS vhost config (like `open_basedir`) **cannot** be overridden by `.user.ini` or `ini_set()` — this is enforced by PHP itself.

---

## Verifying PHP Settings

After changing PHP settings in KiwiPanel, you can verify they are applied correctly by inspecting the live configuration from the website itself.

### Using the KiwiPanel test file

KiwiPanel includes a ready-made inspector at `test/manual/ini.php`. Copy it to your website and open it in a browser:

1. Copy the file to your website's document root:
   ```bash
   cp /path/to/kiwipanel/test/manual/ini.php /home/username/public_html/ini.php
   ```
2. Open it in your browser:
   ```
   https://yourdomain.com/ini.php
   ```
3. The page displays all KiwiPanel-managed settings (resource limits, upload sizes, error handling, sessions, OPcache, security directives) along with installed extensions.
4. Click **View Full phpinfo()** for the complete PHP information output.

::: danger
**Delete `ini.php` immediately after testing.** The file exposes sensitive server configuration — PHP version, loaded extensions, file paths, and security settings — that attackers can use to target your site.

```bash
rm /home/username/public_html/ini.php
```
:::

### Quick alternative

If you just need a quick check, create a minimal file instead:

```php
<?php phpinfo();
```

Save it as `info.php` in your `public_html/` directory, open `https://yourdomain.com/info.php`, then **delete it** right away.

---

## Troubleshooting

### Changes not taking effect

1. Make sure you clicked **Save Settings** after making changes
2. Clear your application's cache (e.g., `wp cache flush` for WordPress)
3. Check if your application has its own PHP configuration (`.user.ini` in `public_html/`)
4. Wait a few seconds — OpenLiteSpeed may take a moment to reload

### Website shows blank page after changing settings

1. Check the error log: **Websites → (your site) → Logs**
2. Common cause: `memory_limit` set too low for your application
3. Common cause: invalid value in custom directives
4. Try resetting to defaults by clicking **Reset Settings**

### Upload failing silently

1. Ensure `post_max_size` ≥ `upload_max_filesize`
2. Check that `max_file_uploads` allows enough files
3. Your web server may also have its own upload limit (OpenLiteSpeed default is 2GB)

### Extensions not showing up

1. Extensions are fetched from the server in real-time. If the agent is unreachable, the extensions section won't appear.
2. After installing a new extension via **Settings → Services**, reload the PHP settings page to see it.
3. Different PHP versions have independent extension sets — check you're looking at the right version.
