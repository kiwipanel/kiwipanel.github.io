# File Manager

KiwiPanel includes a **full-featured, web-based file manager** for every website, as well as a **rescue file manager** with root access for emergency recovery. Browse, edit, upload, download, compress, and manage files directly from the browser — no FTP client or SSH needed.

## Browse & Navigate

- List files and directories with **column sorting** by name, size, or modified date
- **Address bar** with manual path entry and auto-complete
- **Pagination** with configurable page size (25, 50, 100, 250, or 500 items)
- Directories listed first, sort and page size preferences remembered across sessions
- **File type icons** for images, code, documents, archives, and configs
- **Keyboard shortcuts** for quick navigation

## File Operations

- **Create** new files and folders
- **Inline rename** — double-click a filename, press Enter to save, Escape to cancel
- **Copy and move** files between directories — single or bulk
- **Delete** with confirmation — single or bulk
- **Drag-and-drop** to move files within the file list
- **Right-click context menu** for quick access to all actions

## Code Editor

A built-in code editor powered by Ace Editor:

- **Multi-tab editing** — open multiple files simultaneously, each with its own session
- **Tab bar** — switch between open files, dirty indicator dot for unsaved changes, close with click or middle-click
- **File tree sidebar** — collapsible and resizable tree view of the project directory
  - Auto-expands to the currently active file
  - Lazy-loads subdirectories on expand
  - Toggle with the sidebar button or `Ctrl+B` / `Cmd+B`
  - Resize by dragging the handle; width and collapsed state remembered across sessions
- **Tree context menu** — right-click files or folders for New File, New Folder, Rename, and Delete
- **Inline file/folder creation** — create new files or folders directly from the tree header or context menu
- **30+ language modes** — PHP, JavaScript, Python, Go, Rust, Vue, Svelte, Nginx configs, and more
- **Toolbar** — language selector, tab size (2sp / 4sp / hard tab), word wrap toggle, font size controls
- **Save with `Ctrl+S` / `Cmd+S`** — with unsaved changes tracking and discard confirmation
- **Close tab with `Ctrl+W` / `Cmd+W`**
- **Find & Replace** — `Ctrl+F` / `Ctrl+H`
- **Code folding** — collapse blocks for easier navigation
- **Preferences remembered** — font size, wrap mode, and tab size saved between sessions

## Upload

- **Standard upload** for small files
- **Resumable chunked upload** for large files — survives network interruptions

## Download & Preview

- **Direct download** with support for resuming interrupted downloads
- **Image preview** — thumbnails and full-size viewing
- **Video and audio streaming** — play media files directly in the browser
- **Text preview** — quick view for text-based files
- **Archive preview** — peek inside archives without extracting

## Compression & Extraction

- **Compress** files and folders into `.zip`, `.tar.gz`, or `.tar.bz2`
- **Extract** archives including `.zip`, `.tar.gz`, `.tar.bz2`, `.7z`, and `.rar`
- **Bulk compress** — select multiple items and compress in one action

## Search

- **Recursive search** across the entire website directory
- Results displayed in a dedicated pane

## Download Remote File

Download a file from a URL directly into the website's directory — like running `wget` from the browser:

- **Real-time progress** with percentage, download speed, and estimated time
- **Smart filename detection** from URL or server headers
- Supports HTTP and HTTPS, files up to **10 GB**

## Trash & Recovery

Deleted files go to a trash bin instead of being permanently removed:

- **Browse** trashed items
- **Restore** files to their original location
- **Permanently delete** individual items or empty the entire trash

## Permissions & Ownership

- **Permissions dialog** — set read/write/execute with checkboxes, octal preview, and recursive toggle
- **Change owner** (admin only) — change file owner and group, single or bulk

## File Properties

- Right-click any file and select **Properties** to view detailed information including size, permissions, timestamps, and checksums (MD5, SHA256)
- **Recursive folder size** calculation on demand

## Notifications

All actions provide feedback through **toast notifications** — non-intrusive messages that appear briefly without interrupting your workflow.

## Rescue File Manager

A separate file manager available at `/rescue/files` with **unrestricted root access** to the entire filesystem. Intended for emergency recovery and debugging:

- **Token authentication** — requires a rescue token generated at install (rotate via `kiwipanel terminal rotate`)
- **Full feature parity** with the website file manager — multi-tab editor, file tree sidebar, context menu, upload, download, compression, search, trash, and permissions
- Accessible from the **Quick Actions** section on the dashboard
