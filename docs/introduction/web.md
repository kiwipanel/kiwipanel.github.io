### CLI and Web-Based Access

KiwiPanel provides both **command-line** and **web-based** access, built on the same core system.

The **CLI (`kiwipanel`)** is the primary interface. It is designed for developers and system administrators who prefer fast, scriptable, and transparent control directly from the terminal.

The **Web UI** offers a visual interface for common tasks, making day-to-day server management easier. Actions taken in the Web UI map directly to standard Linux services and configuration files, without hiding system behavior. You are encouraged to explore the CLI for more advanced tasks. To access the Web UI, navigate to `http://your-server-ip:8443/passcode`. `passcode` is a unique identifier for your server. You will see the passcode once after installation or you can find it in the CLI by running `kiwipanel passcode` (with root access) in case you forget it. Without the passcode, you cannot access the Web UI but get 404 errors.

The **CLI (`kiwipanel`)** and **Web UI** are built on the same core system, ensuring consistency and ease of use.
