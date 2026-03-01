# Download Remote File (Fetch URL)

The File Manager includes a **Fetch URL** feature that lets you download files from a remote server directly into your website directory — equivalent to running `wget` or `curl` on the command line, but from the browser.

This is useful for installing CMS software (WordPress, Joomla, Laravel), restoring backups, pulling assets from CDNs, or downloading any publicly accessible file without needing SSH access.

## How It Works

1. Click the **Fetch URL** button in the file manager toolbar (the download-cloud icon next to Upload)
2. Enter the URL of the file you want to download
3. Optionally provide a custom filename (otherwise the original filename is used)
4. Click **Download** — the file is saved to your current directory

A real-time progress bar shows download percentage, speed, and estimated time remaining for large files.

## Limits

| Limit | Value |
|-------|-------|
| Maximum file size | 10 GB |
| Download timeout | 60 minutes |
| Concurrent downloads | 3 per server |
| Supported protocols | HTTP and HTTPS only |
| Minimum free disk space | 512 MB |

## Filename Resolution

The downloaded file is named using the following priority:

1. **Your custom filename** — if you provide one in the "Save as" field
2. **Content-Disposition header** — if the remote server suggests a filename
3. **URL path** — the last segment of the URL (e.g., `wordpress-6.5.tar.gz` from `https://example.com/wordpress-6.5.tar.gz`)
4. **Fallback** — `download` if no filename can be determined

If a file with the same name already exists in the destination directory, it will be overwritten.

## Security

All downloads are subject to the following security checks:

- **Protocol restriction** — Only `http://` and `https://` URLs are allowed. Protocols like `file://`, `ftp://`, and `gopher://` are blocked.
- **SSRF protection** — URLs that resolve to private or reserved IP addresses (localhost, `10.x.x.x`, `192.168.x.x`, etc.) are blocked to prevent Server-Side Request Forgery attacks. This includes IPv4-mapped IPv6 addresses.
- **DNS pinning** — DNS is resolved once before the connection is made, preventing DNS rebinding attacks.
- **Redirect validation** — Each redirect hop is checked for private IPs. Maximum 10 redirects.
- **Filename sanitization** — Path separators, `..` sequences, and control characters are stripped from filenames to prevent path traversal.
- **Path validation** — The destination directory must be within your home directory.

::: warning Important Caveats
- **Downloaded files are not scanned for malware.** KiwiPanel does not inspect the content of downloaded files. You are responsible for ensuring that files you download are safe. Exercise the same caution you would when running `wget` on your server.
- **Disk space is your responsibility.** While KiwiPanel blocks downloads when free disk space drops below 512 MB, downloading large files can still consume significant disk space. Monitor your disk usage, especially on smaller VPS plans.
- **Downloads count toward your bandwidth.** The file is downloaded by your server, not your browser. The transfer uses your server's network bandwidth and may count against your hosting provider's bandwidth allocation.
- **No resume support.** If a download is interrupted (network error, timeout, browser tab closed), the partial file is automatically cleaned up. You will need to start the download again from scratch.
- **Overwrite without warning.** If a file with the same name already exists in the destination directory, it will be silently overwritten. Rename existing files first if you need to keep them.
- **HTTPS certificates are validated.** Downloads from servers with expired or self-signed SSL certificates will fail. This is intentional for your security.
:::
