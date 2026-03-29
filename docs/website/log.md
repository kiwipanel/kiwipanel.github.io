# Logs & Log Management

KiwiPanel collects logs from the panel itself, third-party services, website traffic, and terminal sessions. All logs are accessible from the admin dashboard — no SSH required.

## System Logs

Navigate to **Dashboard → System Logs** to view logs from all system components. Each log type has its own tab.

### Available Logs

| Log | What it contains |
|-----|-----------------|
| **Panel** | KiwiPanel application logs (startup, errors, requests) |
| **Agent** | Agent service logs (system operations, terminal sessions) |
| **Install** | Installation script output |
| **Update** | Self-update process logs |
| **Security** | Authentication attempts, rate limiting events |
| **OpenLiteSpeed** | Web server error log |
| **MariaDB** | Database server error log |

Each tab supports filtering by the number of lines (default: 100) and includes a search box to find specific entries.

::: tip
Panel and Agent logs come from systemd journal on production servers. Install, Update, and Security logs are stored as plain text files with automatic rotation.
:::

## Website Logs

Each website has a dedicated **Logs** page showing traffic and error data from three sources.

### Viewing Website Logs

1. Go to **Websites** in the sidebar
2. Click on a website to open its detail page
3. Select the **Logs** tab

You'll see three sub-tabs:

| Tab | What it shows |
|-----|--------------|
| **Access Logs** | Incoming HTTP requests — IP address, URL, status code, response size, user agent |
| **Error Logs** | Web server errors — timestamps, severity level, error messages |
| **PHP Logs** | PHP errors and warnings — fatal errors, notices, stack traces, `error_log()` output |

### Summary Stats

At the top of the logs page, summary cards show:

- **Total Requests** — number of logged access entries
- **Error Rate** — percentage of 4xx and 5xx responses
- **Bandwidth Used** — total response size across all entries

### Adjusting the Number of Lines

Use the **Lines** dropdown to show the last 200, 500, or 1,000 log entries. Logs are always read from the end of the file, so you're seeing the most recent entries first.

### Clearing Logs

Click the **Clear Logs** dropdown to truncate log files:

- **Clear Access Log** — empties `access.log`
- **Clear Error Log** — empties `error.log`
- **Clear PHP Log** — empties `php_error.log`
- **Clear All Logs** — empties all three

::: warning
Clearing logs is permanent and cannot be undone. The web server continues writing to the same files, so new entries will appear immediately after clearing.
:::

::: info Demo Mode
The Clear Logs button is hidden for demo users.
:::

## Terminal Session Logs

KiwiPanel records terminal sessions for audit and security purposes. Every global and website terminal session is logged automatically.

### What Gets Logged

- **Session metadata** — who connected, from which IP, when, and for how long
- **Commands** — every command entered during the session
- **Session lifecycle** — start time, end time, disconnect reason

### Viewing Terminal Sessions

1. Go to **Dashboard → System Logs**
2. Select the **Terminal Sessions** tab

You'll see a list of sessions with:
- Terminal type (Global or Website)
- Connected user and IP address
- Start time and duration
- Number of commands executed

Click on a session to expand it and view the full command history.

### Filtering

Use the filters to narrow down sessions:
- **Type** — show only Global or Website terminal sessions
- **Limit** — number of sessions to display

## Log Rotation

KiwiPanel automatically rotates logs to prevent disk exhaustion.

### Website Log Rotation

Each website gets its own logrotate configuration, created automatically during website setup:

- **Frequency:** Daily
- **Retention:** 14 days of history
- **Compression:** Old logs are gzip-compressed
- **Method:** In-place truncation — the web server doesn't need to be restarted

When a website is deleted, its logrotate configuration is removed automatically.

### System Log Rotation

| Log Type | Rotation | Retention |
|----------|----------|-----------|
| Terminal sessions | Custom cleanup script | 30 days active, 180 days archived |
| Security logs | Daily via logrotate | 90 days |
| Update logs | Daily via logrotate | 30 days |
| Install logs | Monthly via logrotate | 3 months |
| Panel / Agent | journald default | 14 days |

A cleanup cron job runs daily at 3 AM to archive old terminal session logs and delete expired ones. If terminal logs exceed 1 GB total, the oldest sessions are cleaned up immediately.

### Per-Website PHP Error Logging

KiwiPanel automatically configures each website to write PHP errors to its own `php_error.log` file. This is handled transparently — you don't need to configure anything.

The following types of PHP errors are captured:

| Error Type | Example |
|------------|---------|
| Custom logging | `error_log("debug message")` output |
| Warnings | Undefined variables, deprecated functions |
| Fatal errors | Uncaught exceptions, division by zero |
| Stack traces | Full call stack for fatal errors |

::: tip
PHP error logging is managed by KiwiPanel and preserved when you change PHP settings. You don't need to set `error_log` manually in your PHP configuration.
:::

## Troubleshooting

### No logs appearing for a website

- **New website?** Logs only appear after the site receives traffic. Visit your website in a browser to generate an access log entry.
- **PHP logs empty?** Make sure your PHP code is generating errors or using `error_log()`. Check that the PHP version is running correctly from the website's PHP settings page.

### Logs page loads slowly

The logs page reads the last N lines directly from log files. If you're loading 1,000 lines from a very large log file, it may take a moment. Try reducing the line count to 200.

### Disk space concerns

KiwiPanel rotates website logs automatically (14-day retention). For system logs, the cleanup cron job handles terminal session archives. If you need to free space immediately, use the **Clear Logs** button on the website logs page or check log file sizes via the terminal.
