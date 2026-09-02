# File Upload

KiwiPanel supports uploading large files up to **50 GB** through the built-in file manager. Uploads are resumable, so if your connection drops, they continue from where they left off.

## Where to Upload Files

KiwiPanel provides two file manager interfaces:

### Website File Manager

Access your website files at:

```
https://your-panel-ip:8443/websites/{id}/files
```

Example: `https://12.3455.67.89:8443/websites/1/files`

Use this to:
- Upload files to your website directories
- Manage website content (HTML, images, scripts)
- Upload backups and archives
- Edit configuration files

### Rescue Mode File Manager

Access rescue mode at:

```
https://your-panel-ip:8443/rescue/files
```

Example: `https://12.3455.67.89:8443/rescue/files`

Use this to:
- Upload files when your account is locked
- Perform emergency file recovery
- Upload files directly to server root (requires rescue token)

::: tip
The rescue file manager requires an emergency access token. Your system administrator can generate this token using the rescue mode feature.
:::

## Upload Limits

| File Size | Status |
|-----------|--------|
| Up to **50 GB** | ✅ Supported (resumable upload) |
| 8 MB or less | ✅ Supported (instant upload) |

## Features

### Resumable Uploads

Large files are uploaded in small chunks. If your internet connection drops:

- ✅ Upload automatically pauses
- ✅ When connection returns, upload resumes from where it stopped
- ✅ You don't need to start over

### Progress Tracking

The file manager shows:
- Upload percentage (0% to 100%)
- Current speed (MB/s)
- Time remaining
- Ability to pause/cancel uploads

### Multiple Concurrent Uploads

You can upload multiple files at the same time. Each upload runs independently, so if one fails, the others continue.

### Drag and Drop

Simply drag files from your desktop into the file manager interface to start uploading.

## How to Upload a File

1. Navigate to your file manager (website or rescue mode)
2. Click the **Upload** button or drag files into the interface
3. Select one or more files from your computer
4. Choose the destination folder
5. Click **Start Upload**

The upload begins immediately and shows progress for each file.

## Disk Space

::: warning Important
Before uploading large files, ensure your server has sufficient free disk space. A 50 GB upload requires at least 50 GB of available storage.

Check your disk usage in the **Dashboard** before starting large uploads.
:::

## Troubleshooting

### "Upload size exceeds maximum" error

**Cause**: You're trying to upload a file larger than 50 GB.

**Solution**: Split the file into smaller parts or contact your administrator to increase the limit.

### Upload stalls or gets stuck

**Cause**: Network interruption or slow connection.

**Solution**: 
- The upload should automatically resume within 30 seconds
- If it doesn't, refresh the page and try again
- The upload will continue from where it stopped (you don't lose progress)

### "No space left on device" error

**Cause**: Your server has run out of disk space.

**Solution**: 
1. Check disk usage in the Dashboard
2. Delete old files or backups to free up space
3. Try uploading a smaller file
4. Contact your administrator if you need more storage

### File doesn't appear after upload completes

**Cause**: The file uploaded successfully but there may be a display delay.

**Solution**: 
- Refresh the file manager page
- Check the destination folder directly
- If the file still doesn't appear, check the activity log or contact support

## Supported File Types

The file manager supports uploading **any file type**:

- ✅ Archives (.zip, .tar.gz, .rar, .7z)
- ✅ Images (.jpg, .png, .gif, .svg, .webp)
- ✅ Documents (.pdf, .doc, .txt)
- ✅ Videos (.mp4, .avi, .mkv, .mov)
- ✅ Databases (.sql, .db)
- ✅ Backups (any extension)
- ✅ Website files (.html, .css, .js, .php)

## Browser Compatibility

The file manager works in modern web browsers:

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari, Chrome Android)

::: tip
For the best upload experience with large files, use a desktop browser with a stable internet connection.
:::

## Security

All uploads are protected by:

- 🔒 **HTTPS encryption** - Files are encrypted during transfer
- 🔒 **Authentication required** - You must be logged in to upload
- 🔒 **Permission checks** - You can only upload to folders you have access to
- 🔒 **Path validation** - The system prevents uploading to unauthorized locations

Rescue mode uploads additionally require a valid emergency access token, which ensures only authorized users can access the rescue file manager.
