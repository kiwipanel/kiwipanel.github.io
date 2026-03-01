# Website Terminal

Each website in KiwiPanel has a built-in web terminal accessible from the browser — no SSH client needed. The terminal runs as the website's Linux user with restricted permissions, so users can manage files, run dev tools, and debug without risking the rest of the server.

Navigate to **Websites → (your site) → Terminal** to open it, or click the terminal icon in the website dropdown menu.

## How It Works

1. Open the terminal page for your website
2. A WebSocket connection is established to the server agent
3. The agent spawns a restricted shell session running as your website's Linux user
4. You get an interactive terminal (powered by xterm.js) confined to your home directory

The session automatically closes after 20 minutes of inactivity.

## What You Can Do

The terminal provides access to a curated set of ~70 commands covering common tasks:

| Category | Commands |
|----------|----------|
| File operations | `ls`, `cp`, `mv`, `rm`, `mkdir`, `touch`, `chmod`, `find`, `ln`, `du`, `df` |
| Text processing | `cat`, `head`, `tail`, `grep`, `sed`, `awk`, `cut`, `sort`, `diff`, `wc` |
| Editors | `nano`, `vi`, `vim` |
| Archives | `tar`, `gzip`, `zip`, `unzip`, `bzip2`, `xz` |
| Network | `curl`, `wget`, `ssh`, `scp`, `rsync` |
| Dev tools | `git`, `node`, `npm`, `npx`, `php`, `composer`, `python3`, `pip3`, `ruby`, `gem`, `wp` |
| Utilities | `echo`, `date`, `whoami`, `env`, `which`, `clear`, `ps`, `kill` |

Commands not on this list are unavailable. Shell interpreters (`bash`, `sh`, `zsh`, etc.) and privileged commands (`sudo`, `su`, `mount`, `systemctl`, etc.) are intentionally excluded.

## Directory Restriction

The terminal is locked to your website's home directory. You can navigate freely within it but cannot access system directories or other users' files:

```
user1@server:~$ cd public_html
user1@server:~/public_html$ cd ../logs
user1@server:~/logs$ cd /etc
kiwipanel: access denied — you cannot navigate outside your home directory
user1@server:~/logs$ cd ../../
kiwipanel: access denied — you cannot navigate outside your home directory
```

This applies to `cd`, `pushd`, and `popd`. If the shell somehow ends up outside the home directory (e.g., via a sourced script), it is automatically snapped back on the next command.

## Security

The website terminal uses multiple layers of protection to prevent users from escaping their sandbox:

### Restricted Shell (rbash)

On Linux, the terminal runs inside `rbash` (restricted bash), which prevents:

- Changing the `PATH` variable
- Running commands with absolute paths (e.g., `/usr/bin/python`)
- Using `exec` to replace the shell process
- Redirecting output with `>` or `>>`

### Curated Command Set

The `PATH` is set exclusively to a `.kiwi_bin/` directory inside the user's home. This directory contains symlinks to approved commands only — it is owned by root and cannot be modified by the user.

### Home Lock

A custom rcfile overrides `cd`, `pushd`, and `popd` builtins to reject any target outside the home directory. All override functions are marked `readonly` so the user cannot unset them.

### Environment Variable Lock

Critical variables are locked down:

- `PATH` — cannot be changed (enforced by both rbash and `readonly`)
- `SHELL` — cannot be reassigned
- `ENV` and `BASH_ENV` — cannot be set (prevents loading alternative init scripts)

### Privilege Drop

On Linux, the shell process runs with the website user's UID/GID via kernel-level credential switching. Even if all shell-level restrictions were bypassed, the process would still only have the permissions of the unprivileged user.

::: warning Limitations
- **The terminal is not a full Linux shell.** Commands outside the curated list are unavailable. If you need a command that isn't included, contact your server administrator.
- **No root access.** The terminal runs as your website's Linux user. System-level operations require the rescue terminal (admin only).
- **Session timeout.** Sessions close after 20 minutes of inactivity. Unsaved work in terminal editors (nano, vim) will be lost.
- **No persistent background processes.** When the terminal session ends, any processes started in it are terminated. Use proper process managers for long-running tasks.
:::

## Rescue Terminal (Admin Only)

For server-level troubleshooting, administrators can access a root terminal at `/rescue/terminal`. This terminal is hidden from all navigation menus and requires a secret token:

```bash
# 1. Get the terminal token from the server
sudo kiwipanel terminal token

# 2. Navigate to the rescue terminal URL
https://your-panel.com/rescue/terminal

# 3. Enter the token when prompted
```

The rescue terminal has no command or directory restrictions — it is a full root shell intended for recovery and debugging only.

### Isolation Model

KiwiPanel is designed as a **single-admin panel** — you manage your own server and websites. Its terminal isolation relies on Linux file permissions (0750 home directories), a restricted shell, and a curated command whitelist. This is a different approach from shared hosting panels like cPanel, which use kernel-level filesystem isolation (chroot/CageFS) to hide the entire system from untrusted users.

In practice, this means:

| Capability | KiwiPanel | Shared hosting panels (cPanel, etc.) |
|------------|-----------|--------------------------------------|
| Run arbitrary system binaries | Blocked (`.kiwi_bin/` whitelist) | Blocked (CageFS binary control) |
| Read other users' home directories | Blocked (Linux permissions) | Blocked (chroot/CageFS) |
| Read system files like `/etc/passwd` | Readable (standard Linux behavior) | Hidden (chroot/CageFS) |
| See other users' processes (`ps aux`) | Visible | Hidden (CageFS + `hidepid`) |
| Fork bomb / resource exhaustion | Not capped by default | Capped (PAM `nproc` / CloudLinux LVE) |
| Private `/tmp` per user | Shared system `/tmp` | Isolated per user |

None of these gaps expose sensitive data or allow privilege escalation — `/etc/passwd` contains no passwords, and other users' processes are read-only. But if you are hosting websites for **untrusted third parties**, be aware that KiwiPanel does not provide the same level of tenant opacity as panels built for multi-tenant shared hosting.

::: tip Hardening for Multi-Tenant Use
If you plan to host websites for multiple clients on the same server, consider these system-level hardening steps:
- **Hide processes**: Mount `/proc` with `hidepid=2` so users only see their own processes
- **Fork bomb protection**: Add per-user process limits in `/etc/security/limits.d/`
- **Private /tmp**: Use `pam_namespace` or mount namespaces to give each user an isolated `/tmp`
:::
