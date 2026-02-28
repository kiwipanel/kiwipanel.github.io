# Look Mode (Hide / Show Web Interface)

**Look Mode** is a simple toggle mechanism that lets you **hide or show** the KiwiPanel web interface using CLI commands.  

It is designed for maintenance, security hardening, or temporary access control — without stopping services or changing system configuration. Incoming HTTP requests are bypassed by a middleware. Look Mode can be used as a guard for the web interface.

Look Mode can be enabled and disabled safely at any time.

---

### Commands

#### Hide the Web Interface

```bash
kiwipanel maintain lock
```

#### Show the Web Interface

```bash
kiwipanel maintain unlock
```
