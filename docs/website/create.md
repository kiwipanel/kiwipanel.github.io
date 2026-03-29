# Creating a Website

KiwiPanel makes it easy to create and provision websites. The creation process follows a simple 3-step flow: **fill in the form → review → confirm**. Everything else — Linux user, directories, web server config, and optional database — is set up automatically.

## Quick Start

1. Navigate to **Websites** in the sidebar
2. Click the **Create Website** button
3. Fill in the form and click **Create Website**
4. Review the configuration summary
5. Click **Confirm & Create** to provision the website

The entire process takes just a few seconds.

## Step 1: Fill in the Form

### Owner

Choose who owns this website:

- **Admin users** can select any existing user from the dropdown, or create a new client on the fly
- **Client users** are automatically assigned as the owner (no dropdown shown)

::: tip Create a client on the fly
Select **"✨ + Create new client"** from the owner dropdown. KiwiPanel will auto-generate a username and strong password. The credentials are shown **once** on the success page — make sure to copy them before leaving.
:::

### Primary Domain

Enter the main domain for this website (e.g., `example.com`). Do **not** include `http://` or `www`.

This domain becomes:
- The website's identity in the panel
- The primary domain in the web server configuration
- The basis for auto-generated directory names and database names

### Domain Aliases (Optional)

Add additional domains that should also point to this website. Common use cases:

- `www.example.com` alongside `example.com`
- A staging domain like `staging.example.com`
- An old domain that should serve the same content

Click **Add Domain Alias** to add more, or click the ✕ button to remove one.

### Website Type

Choose one of the three supported website types:

| Type | Best for | What it does |
|------|----------|-------------|
| **PHP Application** | WordPress, Laravel, custom PHP apps | Sets up PHP-FPM with your chosen PHP version |
| **Reverse Proxy** | Node.js, Python, Go, or any backend app | Forwards traffic to your backend application |
| **Static Site** | HTML/CSS/JS, JAMstack, documentation | Serves static files only — no server-side processing |

#### PHP Application Options

When you select **PHP Application**, you can configure:

- **PHP Version** — Choose from the installed PHP versions on your server (e.g., 8.1, 8.2, 8.3). The default version is pre-selected.
- **Memory Limit** — Maximum memory per PHP process (default: 256M)
- **Max Execution Time** — Maximum script runtime in seconds (default: 300)
- **Upload Max Size** — Maximum file upload size (default: 64 MB)

::: tip
You can change all PHP settings later from the website's settings page. These are just the initial values.
:::

#### Reverse Proxy Options

When you select **Reverse Proxy**, configure:

- **Backend URL** — The address of your backend application (e.g., `127.0.0.1:3000` or `localhost:8080`)
- **Backend Protocol** — HTTP or HTTPS, depending on what your backend expects
- **WebSocket Support** — Enable if your app uses WebSockets (e.g., real-time chat, live updates)
- **Preserve Host Header** — Forward the original host header to your backend

::: warning
Make sure your backend application is already running and accessible at the specified address before creating the website.
:::

#### Static Site Options

When you select **Static Site**, you can optionally configure:

- **Document Root Subdirectory** — Where your static files live within the website directory (default: `public_html`)
- **Index Files** — Default index files to serve (default: `index.html, index.htm`)

### Database (Optional)

Toggle **Create a database** to provision a MariaDB database along with the website:

- **Database Name** — Auto-generated from the domain (e.g., `example_com_db`), or enter a custom name
- **Database User** — Auto-generated from the domain (e.g., `example_com_usr`), or enter a custom name
- **Password** — Always auto-generated securely (shown once on the success page)

The database uses `utf8mb4` encoding by default.

## Step 2: Review Configuration

After submitting the form, you'll see a **review page** summarizing everything:

- Website name, owner, and server
- Website type and configuration details
- Primary domain and any aliases
- Directory structure preview (Linux user, document root)
- Database settings (if enabled)

This is your chance to double-check everything before provisioning.

::: info Directory Structure
KiwiPanel automatically creates an isolated Linux user for each website. The directory structure looks like:

```
/home/{owner}/
  └── {linux_user}/
      ├── public_html/    ← Document root (your website files go here)
      ├── logs/           ← Access and error logs
      └── tmp/            ← Temporary files
```
:::

## Step 3: Confirm & Create

Click **Confirm & Create** to start provisioning. KiwiPanel runs these steps automatically:

1. **Creating website record** — Saves the website to the database
2. **Setting up Linux user** — Creates an isolated system user
3. **Provisioning directories** — Creates the document root and supporting directories
4. **Configuring web server** — Generates and applies the OpenLiteSpeed configuration
5. **Creating database** — Provisions the MariaDB database (if enabled)

You can watch the progress in real-time on the success page.

## After Creation

Once the website is created, you'll see:

- **Website information** — Domain, owner, Linux user, and document root
- **Generated credentials** (if applicable) — Client account username/password and database credentials

::: warning Save your credentials!
If you created a new client or a database, the generated passwords are shown **only once**. Copy them before leaving the page — they cannot be retrieved later.
:::

### Next Steps

After creating your website, you can:

- **Upload files** via SFTP using the Linux user credentials, or use the built-in File Manager
- **Point your DNS** — Create an A record pointing your domain to your server's IP address
- **Install SSL** — Set up a free Let's Encrypt certificate for HTTPS
- **Install an app** — Deploy WordPress or other applications
- **Manage settings** — Adjust PHP version, memory limits, or web server configuration

## Deleting a Website

To delete a website:

1. Go to **Websites** and find the website you want to remove
2. Click on the website to open its detail page
3. Click the **Delete** button and confirm

::: danger
Deleting a website permanently removes:
- The website record and domain configuration
- The Linux user and all website files on disk
- The web server configuration
- PHP-FPM pool configuration (for PHP sites)

This action **cannot be undone**. Make sure to back up any files you need before deleting.
:::

## Troubleshooting

### Domain not resolving

Make sure your DNS A record points to your server's IP address. DNS changes can take up to 24–48 hours to propagate, though it's usually much faster.

### "502 Bad Gateway" on reverse proxy sites

Your backend application is not running or not accessible at the configured address. Check that:
- Your application is started and listening on the correct port
- The backend URL in the website settings matches your application's address
- No firewall rules are blocking the connection

### Website shows default page instead of your content

Upload your files to the **document root** directory shown on the website detail page (usually `public_html/`). Make sure your main page is named `index.html` or `index.php`.
