# Storage Monitoring

Keep an eye on your server's disk usage before it becomes a problem.

## Why It Matters

Running out of disk space is one of the most common — and most disruptive — server failures. When a disk fills up:

- **Websites go down** — web servers can't write logs or temp files, causing 500 errors
- **Databases crash** — MariaDB refuses writes and may corrupt data
- **Email stops flowing** — mail queues back up and bounce
- **SSH can break** — you may not even be able to log in to fix the problem
- **Backups silently fail** — leaving you with no recovery path

The worst part? It usually happens silently. By the time you notice, the damage is already done.

## What You Get

The **Storage** page gives you a real-time view of every disk on your server — no terminal needed.

![An image](/static/feature_monitor_storage.png)

### Disk Overview

See all mounted filesystems at a glance with:

- Device name and mount point
- Filesystem type (ext4, xfs, etc.)
- Total size, used space, and available space
- A color-coded usage bar that shifts from **green** to **yellow** to **red** as usage climbs

### Visual Warnings

You don't need to read numbers carefully — the page tells you when something needs attention:

| Usage     | Color  | Meaning                        |
|-----------|--------|--------------------------------|
| 0 – 70%  | Green  | Healthy, no action needed      |
| 71 – 85% | Yellow | Getting full, plan ahead       |
| > 85%    | Red    | **WARNING** — act now          |

Any mount point above 85% gets a red **WARNING** badge, and the summary card at the top shows how many disks are in the danger zone.

### Per-User Breakdown

See which users are consuming the most space. Each user's home directory is measured and displayed with a relative size bar, making it easy to spot who's eating up your disk.

### Auto-Refresh

Toggle auto-refresh to keep the data updating every 30 seconds — useful when you're actively cleaning up space or monitoring a growing backup.

## Without This Feature

Without built-in storage monitoring, you'd need to:

1. SSH into your server
2. Run `df -h` and `du -sh /home/*` manually
3. Parse the output yourself
4. Remember to check regularly — or set up external monitoring tools

Most admins don't check until something breaks. KiwiPanel checks for you and makes the problem visible before it becomes an outage.
