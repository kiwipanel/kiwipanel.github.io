# Location


## Web page 

- `/home/kiwiweb/default_site/index.html`: This is the default index file when you visit the IP address of your VPS.

- `/home/linux_user/domain.com/public_html`: This is the home directory for each domain. You can create a new directory here and upload your (HTML or PHP) website files.

## Default locations
Here are the folders on your VPS that Kiwipanel uses:
- `/usr/local/bin/kiwipanel`: This is the "root" binary (written in bash) file of Kiwipanel. Actually it is a wrapper only. You can find the source code of the wrapper at [kiwipanel/scripts/wrapper](https://github.com/kiwipanel/install/releases), inside the folder kiwipanel-scaffold.zip. This bash script is used to start and stop the Kiwipanel service web and kiwipane-agent. Sometimes you might use this binary to fix the permissions of the Kiwipanel binary file (written in Golang), if any. Normally everything is fine. Below is a portion of `kiwipanel` bash script.

```bash
#!/bin/bash
set -euo pipefail

REAL_BIN="/opt/kiwipanel/bin/kiwipanel"
BASE_DIR="/opt/kiwipanel"

# Executes the KiwiPanel binary with the provided arguments
exec "$REAL_BIN" "$@"

```

- `/opt/kiwipanel`: This is the core directory where Kiwipanel is installed. `/opt/kiwipanel/{bin, config, data, logs, meta, scripts, ssl, templates}`: The binary file, the config file, the logs... of Kiwipanel are all located here.
- `/opt/kiwipanel/ssl/panel`: Contains the SSL certificate files. After installing you will get two files: kiwipanel.key and kiwipanel.crt. These files are used to secure the panel and this is self-signed certificate (IP:8443).
- `/home/kiwiweb/default_site/index.html`: This is the default index file when you visit the IP address of your VPS.
- `/usr/local/lsws/`: This is the location of LiteSpeed Web Server (LSWS) on your VPS. LSWS is the web server that Kiwipanel uses to serve the web interface.

- `/usr/local/lsws/conf/httpd_config.conf`: This file is the default configuration file for LiteSpeed Web Server (LSWS). It contains the settings for the web server, such as the listening port, the document root, and the SSL certificate. During the process of installation, Kiwipanel will modify this file to include the necessary settings for the web server. At the bottom of this file, you will find the following lines:

```bash
# =========================================================
# KiwiPanel include (DO NOT REMOVE)
# =========================================================
include /opt/kiwipanel/config/lsws/config/kiwipanel.conf
```
It fundamentally means Kiwipanel will include the configuration file for LSWS in the main configuration file and OVERWRITE/APPEND that configuration at new file located at `/opt/kiwipanel/config/lsws/config/kiwipanel.conf`. 

In case you care about this design, have a look at `https://github.com/kiwipanel/kiwipanel/blob/main/kiwipanel/config/lsws/config/kiwipanel.conf` or in our VPS run `cat /opt/kiwipanel/config/lsws/config/kiwipanel.conf` to see the content of this configuration. Basically it includes two other configuration files.

First, the `include /opt/kiwipanel/config/lsws/config/listeners.conf` has the following content: 

```bash
# =========================================================
# KiwiPanel-managed HTTP listener
# =========================================================
listener HTTP {
    address *:80
    secure  0    
    map KiwiPanel *
}
```
It sets the port for the HTTP listener to 80. (instead of 8088 as default by OpenLiteSpeed) and it maps to Kiwipanel. Kiwipanel is a virtualhost that is defined in the `include /opt/kiwipanel/config/lsws/config/virtualhosts.conf` file.

Second, the file `include /opt/kiwipanel/config/lsws/config/virtualhosts.conf` has the following content: 

```bash
# =========================================================
# Virtual Host: Default IP
# =========================================================

virtualHost KiwiPanel {
    vhRoot         /opt/kiwipanel/config/lsws/vhosts/KiwiPanel
    configFile     /opt/kiwipanel/config/lsws/vhosts/KiwiPanel/vhconf.conf
    allowSymbolLink 1
    enableScript    1
    restrained      1
}
```
It sets config for the virualHost KiwiPanel which turns our to be located at `/opt/kiwipanel/config/lsws/vhosts/KiwiPanel/vhconf.conf`. `vhRoot` simply means the root directory of the virtual host. 

The file `/opt/kiwipanel/config/lsws/vhosts/KiwiPanel/vhconf.conf` has the following content:

```bash
# This is the root directory of the virtual host. Inside this folder we have a index.html file. 
# The content of this file is shown when you visit the IP of the #VPS.
docRoot /home/kiwiweb/default_site/ 
enableGzip 1

context / {
  allowBrowse 1
  rewrite  {
    RewriteFile .htaccess
  }
}

index {
  autoIndexURI /_autoindex/default.php
  indexFiles index.html
  autoIndex 0
  useServer 0
}

```

Now you might realize that the `vhRoot` is the root directory of the virtual host, and the `configFile` is the configuration file for the virtual host. We have successfully changed the default port to 80 and mapped it to Kiwipanel and the html directory is located at `/home/kiwiweb/default_site/`.

- Location of updated panel, the binary files for web-based terminal `/var/lib/kiwipanel`

```bash
root@kiwipanel:/var/lib/kiwipanel# ls
install.d  terminal-bin  update  uploads  watchdog
root@kiwipanel:/var/lib/kiwipanel#

root@kiwipanel:~# cat /var/lib/kiwipanel/update/status.json
{
  "state": "available",
  "message": "Update available: 0.8.5",
  "time": "2026-08-27T08:00:33Z"
}

```

- Mariadb: Installing log: `/var/log/kiwipanel-install.log`

- Mariadb error log: `/var/log/mysql/error.log`
