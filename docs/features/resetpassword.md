# Reset Admin Password

Reset or recover the admin password for your KiwiPanel installation using the CLI.

## For Non-Admin Users

::: info Contact Your Administrator
This CLI command is for **server administrators only** (root access required). If you are a regular user (client) and have forgotten your password, please contact your server administrator to reset it for you. There is currently no self-service password reset available.
:::

## Usage

```bash
kiwipanel password
```

::: warning Root Required
This command must be run as **root**. Log in as root directly or use `su -` to switch to root before running the command. It directly accesses the KiwiPanel database at `/opt/kiwipanel/data/kiwipanel.db`.

Note: `sudo kiwipanel password` may not work if `kiwipanel` is not in sudo's secure path. Use `su -` or log in as root instead.
:::

## How It Works

The command handles three scenarios automatically:

### No Admin User Exists

If there are **no admin users** in the database (e.g., fresh install with an empty database, or all admins were accidentally deleted), the command will **create a new admin user** with the following defaults:

| Field | Value |
|-------|-------|
| Username | `kp_<random>` (e.g., `kp_8c04f87d`) |
| Role | `admin` |
| Level | `100` (Root Admin) |
| Plan | Admin plan (unlimited resources) |

The username follows the same `kp_<8-char hex>` convention used by the install script.

```bash
# kiwipanel password

⚠️  WARNING
This will reset the password for the admin user (role: admin)
If no admin user exists, a new one will be created.
Do you want to continue? (yes/no): yes

✅ Admin user created successfully!

   Username: kp_8c04f87d
   Password: xK9#mP2$vL7nQ4wR

⚠️  Please save this password securely. It will not be shown again.
```

### One Admin User

If exactly **one admin** exists, the command resets that admin's password to a new randomly generated one.

```bash
# kiwipanel password

⚠️  WARNING
This will reset the password for the admin user (role: admin)
If no admin user exists, a new one will be created.
Do you want to continue? (yes/no): yes

✅ Password reset successfully!

   Username: admin
   Password: bT3@nW8*hJ5kR1yF

⚠️  Please save this password securely. It will not be shown again.
```

### Multiple Admin Users

If **multiple admin users** exist, the command resets the password for only the **primary admin** — the one with the highest privilege level. If two admins share the same level, the oldest account (lowest ID) is chosen.

::: tip Only One Admin Is Affected
Unlike earlier versions which reset all admin passwords at once, the current behavior targets only one specific admin. Other admin accounts remain unchanged.
:::

## Password Security

The generated password is:

- **16 characters** long
- Uses a mix of lowercase, uppercase, digits, and special characters (`!@#$%^&*`)
- Generated using Go's `crypto/rand` for cryptographic security
- Hashed with **bcrypt** (cost factor 12) before storage

## Confirmation Prompt

The command always asks for confirmation before making any changes:

```
⚠️  WARNING
This will reset the password for the admin user (role: admin)
If no admin user exists, a new one will be created.
Do you want to continue? (yes/no):
```

Type `yes` to proceed or `no` to abort.

## Troubleshooting

### "must be run as root"

```
❌ must be run as root
```

Log in as root or switch to root:

```bash
su -
kiwipanel password
```

### "sudo: kiwipanel: command not found"

This happens because `kiwipanel` is installed to a path that isn't in sudo's secure `PATH`. Instead of using `sudo`, log in as root directly:

```bash
su -
kiwipanel password
```

### "failed to connect to database"

```
failed to connect to database: ...
```

Ensure the database file exists at `/opt/kiwipanel/data/kiwipanel.db` and the KiwiPanel installation is complete.

### "failed to create admin user"

```
failed to create admin user: ...
```

This may occur if:

- The generated `kp_*` username happens to collide with an existing user (extremely unlikely)
- The Admin plan (ID 1) doesn't exist in the database
- The database is corrupted or locked

Check the database integrity:

```bash
sqlite3 /opt/kiwipanel/data/kiwipanel.db "PRAGMA integrity_check;"
```

## Technical Details

| Detail | Value |
|--------|-------|
| Database path | `/opt/kiwipanel/data/kiwipanel.db` |
| Bcrypt cost | 12 |
| Password length | 16 characters |
| Admin selection | `ORDER BY level DESC, id ASC LIMIT 1` |
| WAL checkpoint | Performed after write for durability |
