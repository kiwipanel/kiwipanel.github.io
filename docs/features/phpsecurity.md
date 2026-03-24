# PHP Security

KiwiPanel secures PHP with **6 independent security layers**. Each layer works on its own — if one is bypassed, the others still protect your server.

All layers are **enabled by default**. No configuration needed.

## Security Layers at a Glance

```
Layer 1: Chroot Jail         — locks PHP inside the website's home directory
Layer 2: UID Isolation       — each website runs as its own Linux user
Layer 3: open_basedir        — limits which directories PHP can access
Layer 4: disable_functions   — blocks dangerous PHP functions
Layer 5: Session Isolation   — keeps sessions separate per website
Layer 6: Header Hardening    — hides PHP version and blocks remote includes
```

### Why so many layers?

No single security measure is bulletproof. Bugs in PHP can bypass `open_basedir`. Extensions can bypass `disable_functions`. Kernel exploits can bypass UID isolation.

With 6 independent layers, an attacker would need to defeat **all of them** to reach another website's files. This defense-in-depth approach is the same principle used by banks and cloud providers.

---

## Layer 1: Chroot Jail

**The strongest layer.** Uses OpenLiteSpeed's built-in `chrootPath` to jail each website's PHP process at the kernel level.

When chroot is active, PHP physically cannot see anything outside the website's home directory. From PHP's perspective, `/` is the website home — the rest of the filesystem simply doesn't exist.

```
What PHP sees inside the chroot:
/
├── public_html/    ← website files
├── logs/           ← access/error logs
├── tmp/            ← sessions, uploads
├── dev/            ← minimal device nodes (null, zero, urandom)
└── etc/            ← copies of resolv.conf, hosts, localtime
```

**What gets blocked:**

- Reading system files like `/etc/passwd` or `/etc/shadow`
- Listing `/home` to discover other users
- Accessing `/proc` for process information
- Any file access outside the website home

**How it looks in the OLS config:**

```
extprocessor lsphp84-example_com {
  type lsapi
  ...
  extUser web_abc123
  extGroup web_abc123
  chrootPath /home/user_abc/abc_example_com    ← jail root
  chrootMode 2                                 ← enforce chroot
}
```

OLS calls `chroot()` after loading PHP's shared libraries but before running any PHP code — no bind mounts needed.

**Enabled by default.** You can toggle it in **Settings → PHP Security**.

---

## Layer 2: UID Isolation (suEXEC)

Each website runs PHP as its own Linux user (UID ≥ 10000). OpenLiteSpeed handles this via LSAPI suEXEC using `extUser`/`extGroup` in the vhost config.

```bash
# Each site gets its own process user
ps aux | grep lsphp
# web_abc123  ... lsphp   (Site A)
# web_def456  ... lsphp   (Site B)
```

**What this prevents:**

- Site A cannot read or write Site B's files
- A compromised site cannot escalate to root
- Each site is fully isolated at the OS level

---

## Layer 3: open_basedir

Restricts which directories PHP can access. Applied via `php_admin_value` in the vhost config, so it **cannot** be bypassed by `.user.ini` or `ini_set()`.

```
php_admin_value open_basedir /home/user_abc/abc_example_com:/tmp:/usr/share/php
```

**Included paths by default:**

| Path | Purpose |
|------|---------|
| `/home/user_xxx/xxx_domain_com` | The website's home directory |
| `/tmp` | PHP temp files and uploads |
| `/usr/share/php` | System PHP libraries (PEAR, Composer) |

You can add extra paths per-website from the admin panel (validated to prevent directory traversal).

---

## Layer 4: disable_functions

Blocks dangerous PHP functions at the engine level. Applied via a global drop-in ini file per PHP version, loaded when lsphp starts.

### Presets

**Standard** (default) — blocks 27 functions:

| Category | Functions blocked |
|----------|------------------|
| Command execution | `exec`, `system`, `passthru`, `shell_exec` |
| Process control | `proc_open`, `popen`, `proc_close`, `proc_get_status`, `proc_nice`, `proc_terminate` |
| POSIX/process | `pcntl_exec`, `pcntl_fork`, `pcntl_signal`, `pcntl_waitpid`, `pcntl_wexitstatus`, `pcntl_wifexited`, `pcntl_wifsignaled`, `pcntl_wifstopped`, `pcntl_wstopsig`, `pcntl_wtermsig`, `pcntl_alarm` |
| Dangerous system | `dl`, `putenv`, `symlink`, `link`, `chown`, `chgrp`, `chmod` |

**Relaxed** — for sites that need WP-CLI, Composer, or Laravel Artisan:

Allows `exec`, `system`, `shell_exec`, `proc_open`, `popen`, `chown`, `chgrp`, `chmod`. Still blocks all `pcntl_*`, `dl`, `putenv`, `symlink`, `link`.

**None** — no restrictions. Only recommended for fully trusted, single-tenant servers.

**Custom** — define your own comma-separated list of functions to block.

### Per-PHP-version presets

Each installed PHP version can use a different preset. For example, you could run most sites on PHP 8.4 with the Standard preset while putting sites that need `exec()` on PHP 8.3 with Relaxed:

```
PHP 8.4 → Standard (most sites)
PHP 8.3 → Relaxed  (WP-CLI / Composer sites)
```

### How it works under the hood

`disable_functions` is a `PHP_INI_SYSTEM` directive — it only takes effect when lsphp starts. OpenLiteSpeed's `phpIniOverride` applies settings per-request (too late). So KiwiPanel writes a drop-in ini file that lsphp reads at startup:

```
/usr/local/lsws/lsphp84/etc/php.d/20-kiwipanel-security.ini
```

> **Note:** The ini path varies by distro. KiwiPanel auto-detects the correct directory by running `lsphp -i | grep "Scan this dir"`.

---

## Layer 5: Session Isolation

Each website's PHP sessions are stored in its own `tmp/` directory instead of the shared `/tmp`:

```
php_value session.save_path /home/user_abc/abc_example_com/tmp
```

This prevents one site from reading another site's session files — a common attack vector on shared hosting.

### Session cookie hardening

| Setting | Default | What it does |
|---------|---------|-------------|
| `session.cookie_httponly` | On | Prevents JavaScript from reading session cookies (XSS protection) |
| `session.cookie_secure` | On | Session cookies only sent over HTTPS |
| `session.use_strict_mode` | On | Rejects uninitialized session IDs (prevents session fixation) |

---

## Layer 6: Header Hardening

| Setting | Default | What it does |
|---------|---------|-------------|
| `expose_php` | Off | Hides the `X-Powered-By: PHP/8.4.x` header (prevents version fingerprinting) |
| `allow_url_include` | Off | Blocks `include('http://...')` (prevents remote file inclusion attacks) |

Both are `PHP_INI_SYSTEM` directives, enforced via the same global drop-in ini as `disable_functions`.

---

## Configuring PHP Security

### Global defaults

Go to **Settings → PHP Security** to configure server-wide defaults that apply to all websites:

- Per-PHP-version `disable_functions` preset (Standard / Relaxed / None / Custom)
- `expose_php` and `allow_url_include` toggles
- Session hardening switches
- Chroot on/off for new websites

### Per-website overrides

Go to **Website → PHP Settings → Security** to customize settings for individual websites:

- Use a different `disable_functions` preset
- Add extra `open_basedir` paths
- Adjust session and header settings

When no override is set, the website automatically inherits the global defaults.

---

## How Security Gets Applied

### When you create a new website

1. KiwiPanel creates a Linux user and home directory
2. Generates `vhconf.conf` with all security directives:
   - `chrootPath` + `chrootMode 2` (if chroot is enabled)
   - `extUser`/`extGroup` for suEXEC
   - `open_basedir` restriction (auto-generated)
   - Session save path isolation
   - Session hardening (httponly, secure, strict mode)
3. Sets up the chroot jail (`dev/`, `etc/`, `tmp/` inside website home)
4. Reloads OpenLiteSpeed

Everything is automatic — no manual configuration needed.

### When you change global settings

1. You save PHP Security settings in the admin panel
2. KiwiPanel writes the drop-in ini to all PHP versions
3. Kills lingering lsphp processes (forces them to restart with the new config)
4. Reloads OpenLiteSpeed

---

## Test It Yourself

Want to verify the security layers are working? Upload any of these PHP files to your website's `public_html/` directory and visit them in your browser. After testing, **delete the files** — you don't want to leave diagnostic scripts on a production site.

### Quick all-in-one test

Save this as `security-test.php` — it checks all 6 layers in one page:

```php
<?php
/**
 * KiwiPanel Security Test
 * Upload to public_html/, visit in browser, then DELETE this file.
 */

echo "<h1>KiwiPanel PHP Security Test</h1>";
echo "<p>Run time: " . date('Y-m-d H:i:s') . "</p>";
echo "<hr>";

// --- Layer 1: Chroot ---
echo "<h2>Layer 1: Chroot Jail</h2>";

$chroot_tests = [
    '/etc/passwd'    => 'System password file',
    '/etc/shadow'    => 'System shadow file',
    '/proc/cpuinfo'  => 'Process info',
    '/home'          => 'Home directory listing',
];

foreach ($chroot_tests as $path => $label) {
    $exists = @file_exists($path);
    $icon = $exists ? '⚠️ VISIBLE' : '✅ BLOCKED';
    echo "<p>{$icon} — {$label} (<code>{$path}</code>)</p>";
}

echo "<hr>";

// --- Layer 2: UID Isolation ---
echo "<h2>Layer 2: UID Isolation</h2>";

$uid = posix_getuid();
$user = posix_getpwuid($uid);
$username = $user ? $user['name'] : 'unknown';

echo "<p>Running as: <strong>{$username}</strong> (UID {$uid})</p>";
if ($uid >= 10000) {
    echo "<p>✅ Running as an isolated website user</p>";
} elseif ($uid === 0) {
    echo "<p>⚠️ Running as root — this should never happen!</p>";
} else {
    echo "<p>⚠️ Running as a system user (UID < 10000)</p>";
}

echo "<hr>";

// --- Layer 3: open_basedir ---
echo "<h2>Layer 3: open_basedir</h2>";

$basedir = ini_get('open_basedir');
if ($basedir) {
    echo "<p>✅ Restricted to: <code>{$basedir}</code></p>";
} else {
    echo "<p>⚠️ open_basedir is not set (no restriction)</p>";
}

// Try reading outside the basedir
$result = @file_get_contents('/etc/hostname');
if ($result === false) {
    echo "<p>✅ Cannot read files outside allowed paths</p>";
} else {
    echo "<p>⚠️ Was able to read /etc/hostname</p>";
}

echo "<hr>";

// --- Layer 4: disable_functions ---
echo "<h2>Layer 4: disable_functions</h2>";

$disabled = ini_get('disable_functions');
if ($disabled) {
    $count = count(array_filter(explode(',', $disabled)));
    echo "<p>✅ {$count} functions disabled</p>";
    echo "<details><summary>Show full list</summary>";
    echo "<pre>" . str_replace(',', "\n", $disabled) . "</pre>";
    echo "</details>";
} else {
    echo "<p>⚠️ No functions are disabled</p>";
}

// Test common dangerous functions
$test_functions = ['exec', 'system', 'passthru', 'shell_exec', 'proc_open'];
echo "<p><strong>Testing blocked functions:</strong></p>";
foreach ($test_functions as $fn) {
    $blocked = !function_exists($fn);
    $icon = $blocked ? '✅ BLOCKED' : '⚠️ Available';
    echo "<p>&nbsp;&nbsp;{$icon} — <code>{$fn}()</code></p>";
}

echo "<hr>";

// --- Layer 5: Session Isolation ---
echo "<h2>Layer 5: Session Isolation</h2>";

$save_path = ini_get('session.save_path');
echo "<p>Session save path: <code>{$save_path}</code></p>";
if ($save_path && $save_path !== '/tmp' && strpos($save_path, '/home/') !== false) {
    echo "<p>✅ Sessions stored in website-specific directory</p>";
} else {
    echo "<p>⚠️ Sessions may be using the shared /tmp directory</p>";
}

$httponly = ini_get('session.cookie_httponly') ? '✅ On' : '⚠️ Off';
$secure = ini_get('session.cookie_secure') ? '✅ On' : '⚠️ Off';
$strict = ini_get('session.use_strict_mode') ? '✅ On' : '⚠️ Off';

echo "<p>{$httponly} — session.cookie_httponly</p>";
echo "<p>{$secure} — session.cookie_secure</p>";
echo "<p>{$strict} — session.use_strict_mode</p>";

echo "<hr>";

// --- Layer 6: Header Hardening ---
echo "<h2>Layer 6: Header Hardening</h2>";

$expose = ini_get('expose_php');
$remote_include = ini_get('allow_url_include');

echo "<p>" . (!$expose ? '✅' : '⚠️') . " expose_php: " . ($expose ? 'On' : 'Off') . "</p>";
echo "<p>" . (!$remote_include ? '✅' : '⚠️') . " allow_url_include: " . ($remote_include ? 'On' : 'Off') . "</p>";

echo "<hr>";
echo "<p><strong>⚠️ Delete this file when you're done testing!</strong></p>";
```

### Test individual layers from the command line

If you prefer testing from the terminal (via SSH or the KiwiPanel website terminal), you can use these one-liners. Run them from your website's `public_html/` directory.

**Test chroot jail:**

```bash
# Try to read /etc/passwd from PHP — should fail if chroot is active
php -r "var_dump(@file_get_contents('/etc/passwd'));"
# Expected: bool(false)
```

**Test UID isolation:**

```bash
# Check which user PHP is running as
php -r "echo posix_getpwuid(posix_getuid())['name'] . ' (UID ' . posix_getuid() . ')\n';"
# Expected: web_xxxxx (UID 10xxx)
```

**Test open_basedir:**

```bash
# Check what open_basedir is set to
php -r "echo ini_get('open_basedir') . \"\n\";"
# Expected: /home/user_xxx/xxx_domain_com:/tmp:/usr/share/php
```

**Test disable_functions:**

```bash
# List all disabled functions
php -r "echo ini_get('disable_functions') . \"\n\";"
# Expected: exec,system,passthru,shell_exec,proc_open,...

# Try calling exec() — should fail
php -r "exec('whoami');"
# Expected: Fatal error: Call to undefined function exec()
```

**Test session isolation:**

```bash
# Check session save path
php -r "echo ini_get('session.save_path') . \"\n\";"
# Expected: /home/user_xxx/xxx_domain_com/tmp
```

**Test header hardening:**

```bash
# Check expose_php
php -r "echo 'expose_php: ' . ini_get('expose_php') . \"\n\";"
# Expected: expose_php: (empty = off)

# Or check HTTP response headers from outside the server
curl -sI https://example.com/ | grep -i "x-powered-by"
# Expected: no output (header is hidden)
```

> **Tip:** The command-line tests run PHP directly via the `php` CLI binary, which may load different settings than the web-facing lsphp. For the most accurate results, use the browser-based `security-test.php` file above — it runs through OpenLiteSpeed with all vhost-level settings applied.

---

## Related Files

| File | Purpose |
|------|---------|
| `internal/agent/php_security_ini.go` | Drop-in ini generation and deployment |
| `internal/agent/chroot.go` | Chroot jail setup and removal |
| `internal/agent/vhost.go` | VHost config with chrootPath, open_basedir |
| `internal/modules/websites/domain/php_security.go` | Security defaults, presets, path validation |
| `html/.../settings/php_security.html` | Global defaults UI |
| `html/.../websites/php.html` | Per-website overrides UI |
