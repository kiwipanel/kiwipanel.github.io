---
title: OPcache Configuration
description: How KiwiPanel manages PHP OPcache — global settings, memory budgets, recommended values, and monitoring.
---

# OPcache Configuration

## What is OPcache?

Without OPcache, PHP **recompiles every script to bytecode on every single request**. For a WordPress page load that touches hundreds of files, that compilation overhead adds up fast.

OPcache is a PHP extension that stores compiled bytecode in **shared memory**, so subsequent requests skip the compile step entirely. The result: dramatically lower CPU usage and faster response times.

::: info Key concepts
- Each PHP version (8.2, 8.3, 8.4) maintains its **own separate OPcache pool** — they never share cached bytecode.
- OPcache memory is allocated when the `lsphp` process starts and is **held for the entire process lifetime**. Changing OPcache settings requires restarting PHP workers.
:::

## How KiwiPanel Manages OPcache

### Global vs. Per-Site Settings

OPcache tuning directives (`opcache.memory_consumption`, `opcache.max_accelerated_files`, etc.) are configured **globally per PHP version** at:

> **Settings → Services → PHP X.Y → Configuration**

Per-site PHP settings only allow toggling `opcache.enable` on or off — all other OPcache tuning is server-wide.

::: tip Why can't I tune OPcache per site?
OPcache directives use `PHP_INI_SYSTEM` scope, meaning they can only be set at process startup — not per-request. Since all sites sharing a PHP version run under the same `lsphp` process pool, OPcache settings apply uniformly to that version.
:::

### The Budget System

KiwiPanel enforces a **cross-version OPcache memory budget** to prevent over-allocation on your server:

```
Budget = min(Total RAM × 20%, 768 MB)
Budget = max(Budget, 64 MB)    // floor for small VPSes
```

- The budget applies to the **sum** of `opcache.memory_consumption` across all PHP versions that have active sites.
- PHP versions with **no websites assigned** don't count toward the budget — they don't spawn `lsphp` workers.
- Per-version hard cap: **2048 MB**.

::: warning
If you try to save a configuration that exceeds the budget, KiwiPanel will reject it and show how much headroom remains.
:::

### Budget Examples

| VPS RAM  | Budget  | 1 PHP version | 2 PHP versions | 3 PHP versions |
|----------|---------|---------------|----------------|----------------|
| 512 MB   | 102 MB  | 102 MB        | 51 MB each     | 34 MB each     |
| 1 GB     | 204 MB  | 204 MB        | 102 MB each    | 68 MB each     |
| 2 GB     | 409 MB  | 256 MB        | 204 MB each    | 128 MB each    |
| 4 GB     | 768 MB  | 256 MB        | 384 MB each    | 256 MB each    |
| 8 GB+    | 768 MB  | 256 MB        | 384 MB each    | 256 MB each    |

## Recommended Settings

### `opcache.memory_consumption`

| Workload | Recommended |
|----------|-------------|
| Small sites (blog, portfolio) | 64–128 MB |
| Medium sites (WooCommerce, small multisite) | 128–256 MB |
| Large sites (large multisite, enterprise apps) | 256–512 MB |

Most WordPress sites run perfectly with **128 MB**.

::: warning
Setting this too high wastes RAM that could be used for PHP workers or MariaDB buffers. Only increase when monitoring shows you need it.
:::

### `opcache.max_accelerated_files`

Controls the maximum number of PHP files OPcache can store.

| Scenario | Value |
|----------|-------|
| Default | 10,000 |
| WordPress core + plugins | 5,000–15,000 files typically |
| Large sites with many plugins | 20,000+ |

PHP rounds this value up to the next prime number internally. Safe values to use: **10000**, **20000**, **50000**.

### `opcache.validate_timestamps`

Controls whether PHP checks if source files have been modified since they were cached.

| Environment | Value | Notes |
|-------------|-------|-------|
| Development | `1` (On) | Always check for changes |
| Production  | `1` (On) | Recommended — users deploy via SFTP/git |

::: danger
Only set to `0` (Off) if you have a deployment pipeline that explicitly clears OPcache after every deploy. Otherwise, code changes will **never** take effect until workers restart.
:::

### `opcache.revalidate_freq`

How often (in seconds) PHP checks whether source files have changed. Only applies when `validate_timestamps` is On.

| Environment | Value | Notes |
|-------------|-------|-------|
| Development | `0` | Check every request |
| Production | `60` | Good balance — changes appear within a minute |
| High-traffic production | `120–300` | Less filesystem overhead |

## Common Pitfalls

### Setting OPcache Too High

❌ _"More is better"_ — setting 512 MB per version with 3 PHP versions = **1.5 GB** just for OPcache.

✅ KiwiPanel's budget system prevents this — it caps total allocation and warns you before saving.

### Multiple PHP Versions

Each PHP version allocates its own OPcache pool **independently**:

```
PHP 8.2: 256 MB  +  PHP 8.3: 256 MB  +  PHP 8.4: 256 MB  =  768 MB total
```

::: tip
Consolidate sites to fewer PHP versions when possible. Fewer active versions means more OPcache headroom per version and lower overall memory usage.
:::

### Forgetting to Restart PHP Workers

OPcache memory is allocated at `lsphp` startup. KiwiPanel **automatically** kills and restarts `lsphp` workers when you save OPcache settings through the UI.

If you edit `php.ini` manually, you must restart workers yourself:

> **Settings → Services → PHP X.Y → Restart Workers**

### OPcache and File Changes

After deploying code (themes, plugins, etc.), OPcache may serve **stale bytecode** until it revalidates.

- With `validate_timestamps=1` and `revalidate_freq=60`, changes appear within **60 seconds**.
- For immediate effect: restart PHP workers via the panel, or call `opcache_reset()` from a PHP script.

## Monitoring OPcache

### Via phpinfo

Navigate to your website's **PHP → phpinfo** tab to see current OPcache status including:

- Memory used vs. allocated
- Hit rate percentage
- Number of cached scripts

### Via PHP Script

Create a temporary file in your site's document root (delete it after use):

```php
<?php
$status = opcache_get_status();
$config = opcache_get_configuration();

echo "Memory used: " . round($status['memory_usage']['used_memory'] / 1024 / 1024, 1) . " MB\n";
echo "Memory free: " . round($status['memory_usage']['free_memory'] / 1024 / 1024, 1) . " MB\n";
echo "Hit rate: " . round($status['opcache_statistics']['opcache_hit_rate'], 1) . "%\n";
echo "Cached scripts: " . $status['opcache_statistics']['num_cached_scripts'] . "\n";
echo "Max scripts: " . $config['directives']['opcache.max_accelerated_files'] . "\n";
```

::: danger Security reminder
This script exposes internal server details. **Delete it immediately** after checking the values.
:::

### What to Look For

| Indicator | Meaning | Action |
|-----------|---------|--------|
| Hit rate below 95% | Scripts are being evicted — OPcache may be too small | Increase `opcache.memory_consumption` |
| Memory usage near 100% | OPcache is full | Increase `opcache.memory_consumption` |
| Cached scripts near max | File limit reached | Increase `opcache.max_accelerated_files` |
| Hit rate above 99% | OPcache is working perfectly | Don't increase memory unnecessarily |

## Quick Reference

::: tip TL;DR for most users
Leave OPcache at **128 MB** per PHP version. Only increase if your hit rate drops below 95% or if you run large WordPress multisites.
:::

| Setting | Production Default | When to Change |
|---------|-------------------|----------------|
| `opcache.memory_consumption` | 128 MB | Hit rate < 95% or memory full |
| `opcache.max_accelerated_files` | 10,000 | Cached scripts near limit |
| `opcache.validate_timestamps` | `1` (On) | Only disable with a proper deploy pipeline |
| `opcache.revalidate_freq` | `60` | Lower for dev, higher for high-traffic |
