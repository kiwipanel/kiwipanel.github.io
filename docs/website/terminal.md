# Website Terminal

Each website in KiwiPanel has a built-in web terminal accessible from the browser — no SSH client needed. The terminal runs as the website's Linux user with restricted permissions, so users can manage files, run dev tools, and debug without risking the rest of the server.

Navigate to **Websites → (your site) → Terminal** to open it, or click the terminal icon in the website dropdown menu.

::: warning
The website terminal is designed for single-admin panel deployments. It provides strong isolation for a single trusted user but is not a substitute for full multi-tenant hosting security.
:::

## How It Works

1. Open the terminal page for your website
2. A WebSocket connection is established to the server agent
3. The agent spawns a restricted shell session running as your website's Linux user
4. On Linux systems, the shell runs inside a **systemd sandbox** with strict resource and filesystem isolation
5. You get an interactive terminal (powered by xterm.js) confined to your home directory

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

### Systemd Sandbox (Linux)

On Linux systems with systemd v249+, terminal sessions run inside a **transient systemd service** with the following security properties:

| Property | Description |
|----------|-------------|
| `NoNewPrivileges=yes` | Process cannot gain new privileges (e.g., via setuid binaries) |
| `PrivateTmp=yes` | Isolated `/tmp` directory per session — cannot see other users' temp files |
| `ProtectSystem=strict` | Root filesystem is read-only — cannot modify system files |
| `ProtectHome=tmpfs` | Other users' homes are invisible; only your own home is visible |
| `BindPaths=<home>` | Only your home directory is bind-mounted into the sandbox |
| `TasksMax=50` | Maximum 50 processes per session — fork bombs are capped |
| `MemoryMax=256M` | Maximum 256MB memory usage per session |
| `MemoryHigh=200M` | Memory throttling begins at 200MB |
| `CPUQuota=50%` | Maximum 50% CPU usage per session |
| `ProtectKernelTunables=yes` | Kernel tunables are read-only |
| `ProtectKernelModules=yes` | Cannot load/unload kernel modules |
| `ProtectControlGroups=yes` | cgroup hierarchy is read-only |
| `LockPersonality=yes` | Cannot change execution domain |
| `RestrictSUIDSGID=yes` | SUID/SGID execution is restricted |
| `ProtectKernelLogs=yes` | Kernel logs are read-only |
| `ProtectClock=yes` | Cannot change system clock |
| `RestrictRealtime=yes` | Cannot use real-time scheduling |
| `SystemCallArchitectures=native` | Only native syscalls allowed (no 32-bit compatibility) |
| `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6` | Only Unix, IPv4, and IPv6 sockets allowed |
| `PrivatePIDs=yes` (v256+) | Other processes on the system are invisible |

::: tip
The minimum supported systemd version is **249**. On systems with systemd v256+, `PrivatePIDs=yes` provides additional process isolation.
:::

-------

### Restricted Command Set

The `PATH` is set exclusively to a shared `terminal-bin` directory (`/var/lib/kiwipanel/terminal-bin` on Linux, `/tmp/kiwipanel/terminal-bin` on macOS). This directory contains symlinks to approved commands only — it is owned by root and cannot be modified by the user.

### Home Lock

A custom rcfile overrides `cd`, `pushd`, and `popd` builtins to reject any target outside the home directory. All override functions are marked `readonly` so the user cannot unset them.

### Environment Variable Lock

Critical variables are locked down:

- `PATH` — cannot be changed (enforced by readonly)
- `SHELL` — cannot be reassigned
- `ENV` and `BASH_ENV` — cannot be set (prevents loading alternative init scripts)
- `LESSSECURE` — set to `1` to disable less command escape sequences
- `GIT_TERMINAL_PROMPT` — set to `0` to prevent interactive git prompts

### Command Guard

A **keystroke-level guard** intercepts input before it reaches the PTY. It reconstructs the command line from individual bytes (handling backspace, Ctrl+C, Ctrl+U, etc.) and checks the assembled command when Enter is pressed.

If a dangerous command is detected, the guard:
1. Absorbs the Enter keystroke (does not forward it to PTY)
2. Sends a warning message to the WebSocket (displayed to user)
3. Sends Ctrl+C to the PTY to clear the current line

Blocked commands include:

| Category | Examples |
|----------|----------|
| Filesystem destruction | `rm -rf /`, `rm --no-preserve-root`, `find / -delete` |
| Disk/device destruction | `mkfs /dev/sda`, `dd of=/dev/sda` |
| Fork/process bombs | `:(){ :|:& };:`, background process loops |
| Disk space exhaustion | Large `dd`/`fallocate`, `yes > file` |
| Memory exhaustion | Python memory bombs, `stress` |
| Permission attacks | `chmod 000 /`, `chown root /etc` |
| Sensitive file access | Reading `/etc/shadow` (website terminals only) |
| Network abuse | Flood ping, netcat listeners (website terminals only) |
| Process killing | `kill -9 1`, `pkill sshd` |
| Shell escapes | Python `pty.spawn`, `os.system` |

### Privilege Drop

The shell process runs with the website user's UID/GID via kernel-level credential switching. Even if all shell-level restrictions were bypassed, the process would still only have the permissions of the unprivileged user.

## Isolation Model Comparison

| Security Feature | Systemd Sandbox (v256+) | Systemd Sandbox (v249-255) | PHP Chroot Jail |
|------------------|-------------------------|---------------------------|-----------------|
| Root filesystem access | **Read-only** (`ProtectSystem=strict`) | **Read-only** (`ProtectSystem=strict`) | **Invisible** (no `/` exists) |
| Read system files like `/etc/passwd` | **Invisible** (`ProtectHome=tmpfs`) | **Invisible** (`ProtectHome=tmpfs`) | **Invisible** (no `/etc` exists) |
| Other users' homes | **Invisible** (`ProtectHome=tmpfs`) | **Invisible** (`ProtectHome=tmpfs`) | **Invisible** (outside chroot) |
| See other users' processes | **Invisible** (`PrivatePIDs=yes`) | Visible (system v249-255 limitation) | Visible (no PID namespace) |
| Maximum processes | **50** (`TasksMax=50`) | **50** (`TasksMax=50`) | No limit |
| Maximum memory | **256MB** (`MemoryMax=256M`) | **256MB** (`MemoryMax=256M`) | No limit |
| CPU limit | **50%** (`CPUQuota=50%`) | **50%** (`CPUQuota=50%`) | No limit |
| Fork bomb / resource exhaustion | **Capped** (by cgroup limits) | **Capped** (by cgroup limits) | Not capped |
| Private `/tmp` per session | **Yes** (`PrivateTmp=yes`) | **Yes** (`PrivateTmp=yes`) | Yes (chroot `/tmp`) |
| Network access | **Yes** (AF_INET/AF_INET6 allowed) | **Yes** (AF_INET/AF_INET6 allowed) | Yes (if socket in chroot) |
| Minimum systemd version | 256 | 249 | N/A |

## Hardening for Multi-Tenant Use

While KiwiPanel is designed for single-admin deployments, you can harden the environment for multi-tenant scenarios:

::: warning
The following suggestions assume you understand the security trade-offs. The systemd sandbox already provides strong isolation for most single-admin use cases.
:::

1. **Enable PHP Chroot Jail** — For PHP websites, enable chroot isolation via the PHP Security settings. This provides stronger filesystem isolation than the systemd sandbox alone (system files are completely invisible, not just read-only).

2. **Configure Resource Limits** — Adjust systemd sandbox limits in `/etc/systemd/system/kiwipanel-agent.service` if needed:
   ```ini
   # Override with systemctl edit kiwipanel-agent
   [Service]
   # These are defaults; increase if users need more
   # TasksMax is enforced via systemd-run arguments
   ```

3. **PAM Limits** — Ensure `/etc/security/limits.conf` has appropriate ulimits for website users:
   ```
   * soft nproc 50
   * hard nproc 100
   * soft nofile 1024
   * hard nofile 2048
   ```

4. **Disk Quotas** — Enable filesystem quotas to prevent disk space exhaustion:
   ```bash
   # Set per-user quota
   setquota -u web_user 1G 2G 0 0 /
   ```

5. **Network Isolation** — Consider using firewall rules to restrict which ports each website user can access.

6. **Audit Logs** — Terminal sessions are logged to `kiwipanel/logs/kiwipanel.json`. Monitor these logs for suspicious activity.

## Troubleshooting

### "Sandbox not available" error

The systemd sandbox requires systemd v249+. Check your version:

```bash
systemctl --version
```

If your system uses an older systemd version, the terminal will fall back to the traditional shell-based restrictions only.

### Terminal won't start

1. Check the agent logs: `tail -f kiwipanel/logs/kiwipanel.json`
2. Ensure the website's Linux user exists: `id web_user`
3. Verify the terminal-bin directory exists: `ls /var/lib/kiwipanel/terminal-bin/`

-------

### Commands not found

Ensure the `/var/lib/kiwipanel/terminal-bin/` directory exists and contains symlinks to allowed commands. This shared directory is created automatically on agent startup.
