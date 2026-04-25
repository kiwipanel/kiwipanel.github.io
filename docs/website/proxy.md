---
title: Proxy Sites
description: Create and manage reverse-proxy websites in KiwiPanel
---

# Proxy Sites

A **proxy site** is a whole-site reverse proxy served by OpenLiteSpeed / LiteSpeed Web Server (LSWS). Every request that hits the virtual host is forwarded to a backend application — there is no PHP runtime, no document-root file serving, and no per-path routing. If you need to proxy only a sub-path on a PHP site.

KiwiPanel supports three site types — **php**, **proxy**, and **static**. This page covers the **proxy** type exclusively. 

::: info Source paths are not links
Source-code paths referenced throughout this page (templates, handlers, schema, etc.) are shown as plain text rather than clickable links because they live outside the `docs/` root and VitePress cannot resolve those paths at build time. Browse them directly in the repository.
:::

## When to use a Proxy Site

Use a proxy site when your application handles its own HTTP and you just need LSWS to terminate TLS and forward traffic. Common examples:

- A **Node.js / Deno / Bun** app listening on `127.0.0.1:3000`
- A **Go** or **Python** (Gunicorn / Uvicorn) server on a local port
- A **Docker** container exposing an HTTP port on the host network or `172.17.0.x`
- A backend microservice on a private RFC 1918 address like `10.0.0.5:8080`

::: tip Loopback is allowed
Unlike the strict SSRF check used for per-path [Reverse Proxy Rules](./reverse-proxy-rules.md), whole-site proxy backends use `internal/modules/websites/domain/ssrf.go:196` (`ResolveBackendForLocalProxy`) which **allows** loopback (`127.0.0.0/8`, `::1`) and RFC 1918 addresses. Only link-local (`169.254.x.x` — cloud metadata!), multicast, and broadcast ranges are rejected.
:::

## Creating a Proxy Site

1. Navigate to **Websites → New** (`/websites/new`).
2. Select **Site Type = proxy**.
3. Fill in the form fields:

| Field | Description |
|-------|-------------|
| **Domain** | Primary domain for the virtual host, e.g. `app.example.com`. |
| **Backend URL** | Full URL including scheme, e.g. `http://127.0.0.1:3000`. |
| **Preserve Host** | Toggle on to send `X-Forwarded-Host: $host` so the backend sees the public hostname. |
| **Custom Request Headers** | Optional. One `Key: Value` per line. Injected into every proxied request. |

::: info
The **path** is locked to `/` — you cannot proxy only a sub-path from this form. Per-path proxying is a separate feature available on PHP sites.

4. Click **Create**. KiwiPanel writes a row to `website_proxy_config`, renders the LSWS vhconf from `kiwipanel/templates/lsws/vhconf_proxy.tmpl`, and gracefully reloads LSWS.

## Editing the Backend

After creation, visit **Websites → {site} → Settings** (`/websites/{id}/setting`). The **Proxy Backend** card shows:

- A read-only summary of the current backend URL, resolved IP, and preserve-host state.
- Editable fields: backend URL, preserve-host toggle, custom request headers textarea.

::: warning
Saving regenerates the LSWS vhconf and triggers an automatic graceful reload. The site will briefly serve stale connections from the old worker while the new config takes effect.
:::

## Validation rules

- **Backend URL** must be a valid `http` or `https` URL with a non-empty host.
- **Path** is always `/` (whole-site proxy). 
- **Hostname resolution** uses `internal/modules/websites/domain/ssrf.go:196` (`ResolveBackendForLocalProxy`) — public IPs and loopback (`127.0.0.0/8`, `::1`) are allowed; link-local, multicast, and broadcast are rejected. The resolved IP is persisted and re-verified at apply time as a DNS-rebinding mitigation.
- **Header names** must match the RFC 7230 token grammar (alphanumerics plus ``! # $ % & ' * + - . ^ _ ` | ~``). No spaces or colons in the name portion.
- **Reserved headers** are rejected: `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-For`, `Connection`, `Content-Length`, `Transfer-Encoding`. See `internal/modules/websites/domain/proxy_config.go:32` (`reservedProxyHeaderNames`).
- **Duplicate header names** are deduped case-insensitively (the map key is the canonical form).
- Maximum **32 custom headers**, each name ≤ 128 chars, each value ≤ 1024 chars, total ≤ 8 KiB.

## Generated LSWS vhconf

When a proxy site is created or updated, KiwiPanel renders `kiwipanel/templates/lsws/vhconf_proxy.tmpl` into the virtual host configuration directory.

::: details Click to expand — example rendered vhconf

```nginx{7,10,21}
# KiwiPanel-managed VirtualHost (PROXY): app.example.com
# Generated at: 2026-04-24T13:30:00+07:00
# WARNING: Do not edit manually — changes will be overwritten

docRoot /home/user1/domains/app.example.com/public_html
enableGzip 1

# Whole-site reverse proxy upstream
extprocessor kp_proxy_app.example.com {
  type                    proxy
  address                 http://127.0.0.1:3000
  maxConns                100
  initTimeout             60
  retryTimeout            0
  respBuffer              0
  autoStart               0
  pcKeepAliveTimeout      60
}

# URL context — entire site forwarded to upstream
context / {
  type                    proxy
  handler                 kp_proxy_app.example.com
  addDefaultCharset       off
  extraHeaders            <<<END_extraHeaders
X-Forwarded-Host $host
X-Forwarded-Proto $scheme
X-Forwarded-For $remote_addr
X-Custom-Header: my-value
END_extraHeaders
}
```

:::

Key blocks:

- **`extprocessor`** — defines the upstream with the resolved IP (not hostname) to mitigate DNS rebinding.
- **`context /`** — forwards all traffic to the upstream. WebSocket support and extra headers are injected here.
- An **ACME challenge context** at `/.well-known/acme-challenge/` is rendered _before_ `context /` so Let's Encrypt validation is never intercepted by the backend.

## What proxy sites do NOT have

Several sidebar tabs and settings cards are hidden for proxy-type sites:

- **PHP** tab and PHP version / extension cards
- **Reverse Proxy Rules** tab (that feature is for per-path proxying on PHP sites)
- **Rewrite Rules** tab
- **.htaccess Convert** tab

The tab-hiding logic lives in `html/template/themes/backend/layouts/website_tabs.html`. The settings page strips PHP/runtime cards via the site-type guard in `internal/modules/websites/transport/http/setting.go`.

::: info
Proxy sites still have access to **Domains**, **SSL**, **Logs**, **Backups**, and **Activity** tabs — everything that doesn't assume a PHP runtime.
:::

## Security notes

::: danger
- **Never expose a backend** that relies solely on network-level ACLs (e.g. "only accessible from localhost") without also enabling a TLS listener or authentication on the backend itself. LSWS will faithfully forward any request it receives.
- **`preserve_host = on`** means the backend sees the public hostname in `X-Forwarded-Host`, not `127.0.0.1`. If your backend uses the Host header for routing or access control, this matters.
- **Custom headers can leak secrets** if mis-templated. Avoid putting raw API keys in the headers textarea — use environment variables in your app instead.
- The resolved IP is persisted and re-checked at vhconf apply time. If the IP changes between save and apply, the operation is rejected with `ErrSSRFRebind` to prevent DNS-rebinding attacks.
:::

## Database storage

Proxy configuration is persisted in the `website_proxy_config` table — one row per website. Key columns:

| Column | Type | Notes |
|--------|------|-------|
| `website_id` | `INTEGER` | FK to `websites.id` |
| `backend` | `TEXT` | Full backend URL |
| `resolved_ip` | `TEXT` | IP returned by `ResolveBackendForLocalProxy` at save time |
| `path` | `TEXT` | Always `/` |
| `headers_json` | `TEXT` | JSON object of custom headers |
| `preserve_host` | `BOOLEAN` | |
| `websocket_enabled` | `BOOLEAN` | |
| `connect_timeout` | `INTEGER` | Seconds |
| `read_timeout` | `INTEGER` | Seconds |
| `health_check_path` | `TEXT` | Optional health endpoint |

Schema source: `internal/infra/db/migrations/schema.sql`. The table is auto-created by `ensureRuntimeColumns()` (in `internal/infra/db/connect.go`) on panel startup if missing.

## Troubleshooting

- **Site returns 503** → The backend is not reachable from the LSWS worker process. Verify the app is listening on the configured address/port, check firewall rules, and confirm the LSWS user can reach loopback.

- **`CSRF token invalid or missing` on save** → Your session has expired or the page has been open too long. Reload the page and retry.

- **`SQL logic error: table website_proxy_config has no column named path`** → The database schema is outdated. Restart the panel — `ensureRuntimeColumns()` will add the missing column automatically.

- **Backend rejected with `loopback not allowed`** → You may be hitting the strict SSRF validator (`ResolveBackend`) instead of the loopback-friendly variant (`ResolveBackendForLocalProxy`). This is a bug — please report it.

- **Headers field shows `Header name invalid`** → Header names must be RFC 7230 tokens: alphanumerics plus ``! # $ % & ' * + - . ^ _ ` | ~``. No spaces or colons in the name. Colons are only used as the name/value separator.

- **`resolved IP changed since validation`** → DNS rebinding protection triggered. The hostname resolved to a different IP between save and vhconf apply. Re-save to capture the new IP, or use a literal IP in the backend URL.
