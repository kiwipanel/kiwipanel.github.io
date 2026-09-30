# Component Update Operations

## Overview

KiwiPanel provides controlled update operations for critical infrastructure components like PHP versions and databases. These operations are designed for safety, requiring root privileges and using global lifecycle locking to prevent concurrent modifications.

## LSPHP Version Updates

### Command

```bash
kiwipanel component update-lsphp <family>
```

Updates packages for an already-installed LSPHP version family to the latest available patches.

### Prerequisites

- Root privileges (UID 0)
- Linux operating system (Ubuntu or Enterprise Linux 9)
- Target LSPHP family already installed
- No other lifecycle operations running (installation, updates, etc.)
- No pending KiwiPanel self-update

### Supported Families

- `lsphp74` - PHP 7.4
- `lsphp80` - PHP 8.0
- `lsphp81` - PHP 8.1
- `lsphp82` - PHP 8.2
- `lsphp83` - PHP 8.3
- `lsphp84` - PHP 8.4

### What It Does

The update operation:

1. **Validates parameters** - Ensures the family name is valid and safe
2. **Acquires global lifecycle lock** - Prevents concurrent operations
3. **Checks for pending self-update** - Rejects if KiwiPanel update is staged
4. **Discovers installed packages** - Identifies all packages belonging to the target family
5. **Records baseline version** - Captures current PHP version and loaded modules
6. **Updates packages** - Uses apt/dnf to update only the target family packages
7. **Verifies binary** - Checks that the updated PHP binary executes successfully
8. **Compares versions** - Confirms version change or reports no updates available
9. **Verifies modules** - Ensures all previously loaded extensions still load
10. **Attempts protection restoration** - Reapplies package hold/versionlock if previously set
11. **Releases lock** - Frees the lifecycle lock for other operations

### What It Does NOT Do

- **Does not activate the new version** - Existing web server worker processes continue using the old PHP version until you explicitly restart them
- **Does not install new packages** - Only updates already-installed packages from the target family
- **Does not modify other PHP versions** - Other installed PHP families remain untouched and protected
- **Does not affect MariaDB** - Database protections remain in place
- **Does not provide automatic rollback** - If the update partially applies and then fails, manual intervention may be required

### Examples

Update PHP 8.3:

```bash
kiwipanel component update-lsphp lsphp83
```

Expected output on success:

```
Updating LSPHP family: lsphp83

✓ Parameter validation passed

Starting update operation...

Update Result:

  Baseline version: 8.3.12
  Updated version:  8.3.13
  Changed packages: 15
    - lsphp83
    - lsphp83-common
    - lsphp83-curl
    - lsphp83-mbstring
    - lsphp83-mysql
    - lsphp83-opcache
    - lsphp83-xml
    ...
  Protection:       restored

✓ Update completed successfully

IMPORTANT: The update is complete, but existing worker processes
are still using the old PHP version. You must restart the web
server to activate the new version:

  systemctl restart lsws
```

### Failure Modes

The operation can fail at several points:

#### Pre-update Failures (Safe)

These failures occur before any packages are modified:

- **Invalid family name** - Parameter validation rejects malformed input
- **Not running as root** - Permission check fails
- **Not on Linux** - Platform check rejects non-Linux systems
- **Unsupported platform** - Rejects EL10/DNF5 and untested Ubuntu versions
- **Lock acquisition failure** - Another lifecycle operation is running
- **Pending self-update** - KiwiPanel update is staged and waiting to apply
- **Package discovery failure** - Cannot enumerate installed packages (corrupt dpkg/rpm database)
- **No packages found** - Target family is not installed
- **Binary not functional** - Pre-update verification fails

#### Update Failures (Potentially Partial)

These failures can occur after packages have been partially modified:

- **Package manager failure** - apt/dnf transaction fails or is interrupted
- **Binary verification failure** - Updated PHP binary does not execute correctly
- **Module loss** - Previously loaded extensions fail to load after update
- **Protection restoration failure** - Cannot reapply package hold/versionlock

When these failures occur, the operation returns an error, but **packages may have been partially updated**. The system may be in an inconsistent state requiring manual review.

### Post-Update Activation

**Critical:** The update operation does not activate the new PHP version for existing websites. You must explicitly restart the web server:

```bash
systemctl restart lsws
```

Until you restart, existing worker processes continue using the old PHP version from memory. New requests after restart will use the updated version.

### Safety Guarantees

The operation provides these safety guarantees:

- **Exclusive execution** - Only one lifecycle operation runs at a time via global lock
- **Parameter validation** - Rejects shell metacharacters and invalid family names
- **Scope isolation** - Only updates packages matching the target family prefix
- **Platform verification** - Requires tested Ubuntu/EL9 platforms
- **Binary verification** - Confirms PHP binary is functional before and after update
- **Module tracking** - Detects if extensions are lost during the update
- **Protection preservation** - Attempts to restore package hold/versionlock after update

### Safety Limitations

The operation has these known limitations:

- **No automatic rollback** - If packages partially apply and then the operation fails, you must manually recover
- **No crash recovery** - If the process is killed during update, protection may not be restored and lock may not be released
- **Protection restoration is best-effort** - If reapplying hold/versionlock fails, packages remain unprotected
- **Module verification is binary** - Only detects complete module loss, not runtime behavior changes
- **Worker activation not verified** - Cannot confirm that restarting the web server successfully activated the new version

### Troubleshooting

#### Lock acquisition fails

Another lifecycle operation is running. Wait for it to complete or check for stale locks:

```bash
# Check for running lifecycle operations
ps aux | grep -E 'kiwipanel|apt|dnf'

# If no operations are running but lock persists, check lock file
ls -la /var/lock/kiwipanel-lifecycle.lock

# Remove stale lock only if you're certain no operation is running
rm /var/lock/kiwipanel-lifecycle.lock
```

#### Pending self-update rejection

A KiwiPanel self-update is staged. You must either apply or cancel it before updating components:

```bash
# Apply the pending update
systemctl start kiwipanel-update.service

# Or cancel it by removing the ready marker
rm -f /opt/kiwipanel/updates/ready
```

#### Package discovery fails

The package database may be corrupt. Repair it before attempting the update:

**Ubuntu/Debian:**
```bash
dpkg --configure -a
apt-get update
```

**Enterprise Linux:**
```bash
dnf check
dnf update --refresh
```

#### Binary verification fails after update

The updated PHP binary does not execute correctly. Check system logs and consider manual recovery:

```bash
# Check system logs
journalctl -xe

# Attempt to run the binary directly
/usr/local/lsws/lsphp83/bin/php --version

# If the binary is broken, consider downgrading
apt-cache policy lsphp83  # Ubuntu
dnf list --showduplicates lsphp83  # EL
```

#### Modules lost after update

Extensions that were loaded before the update fail to load afterward. Check for missing extension packages:

```bash
# List installed extension packages
dpkg -l | grep lsphp83  # Ubuntu
rpm -qa | grep lsphp83  # EL

# Check PHP module loading
/usr/local/lsws/lsphp83/bin/php -m
```

#### Protection restoration fails

Package hold/versionlock could not be reapplied. Manually restore protection:

**Ubuntu/Debian:**
```bash
apt-mark hold lsphp83 lsphp83-common lsphp83-curl ...
```

**Enterprise Linux:**
```bash
dnf versionlock add lsphp83 lsphp83-common lsphp83-curl ...
```

### Platform-Specific Behavior

#### Ubuntu (Debian-based)

- Uses `apt-get update` and `apt-get upgrade`
- Package protection via `apt-mark hold`
- Package discovery via `dpkg-query`
- Supported versions: Ubuntu 20.04, 22.04, 24.04

#### Enterprise Linux 9 (RHEL, AlmaLinux, Rocky)

- Uses `dnf upgrade`
- Package protection via `dnf versionlock`
- Package discovery via `rpm -qa`
- Uses transaction-local `--setopt=exclude=` rather than modifying persistent exclusions
- Supported versions: EL9

#### Enterprise Linux 10 (Future)

- Currently **rejected** - DNF5 behavior not verified
- Will require testing before enabling support

### Related Operations

- **Installing PHP versions** - Use the existing installation workflow
- **Removing PHP versions** - Not yet supported
- **Updating MariaDB** - Not yet implemented
- **KiwiPanel self-update** - Handled by separate update mechanism

## Best Practices

1. **Test in staging first** - Always test component updates in a non-production environment
2. **Schedule during maintenance windows** - Updates may require web server restart
3. **Verify worker activation** - After restarting the web server, confirm websites are using the new PHP version
4. **Monitor logs** - Watch system and application logs for unexpected behavior
5. **Have rollback plan** - Know how to downgrade packages if the update causes issues
6. **Update one family at a time** - Don't attempt to update multiple PHP versions simultaneously
7. **Check dependencies** - Ensure applications are compatible with updated PHP versions

## Security Considerations

- **Root-only operation** - Only UID 0 can execute component updates
- **No privilege escalation** - Does not grant additional permissions to non-root users
- **Shell injection protection** - Parameter validation rejects metacharacters
- **Lock-based exclusion** - Prevents concurrent modifications
- **Self-update coordination** - Rejects component updates when KiwiPanel update is pending
- **Audit trail** - Operations are logged to system logs

## Future Enhancements

Planned improvements to component update operations:

- **Automatic rollback** - Snapshot package state and restore on failure
- **Crash recovery** - Detect interrupted updates and clean up or complete them
- **Worker activation verification** - Confirm web server restart successfully activated new version
- **MariaDB update support** - Extend update operations to database server
- **Dry-run mode** - Preview update without applying changes
- **Update scheduling** - Queue updates for execution during maintenance windows
- **Notification integration** - Alert operators of available updates
