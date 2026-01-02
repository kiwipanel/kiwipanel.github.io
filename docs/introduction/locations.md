# Location

## Default locations
Here are the folders on your VPS that Kiwipanel uses:
- `/usr/local/bin/kiwipanel`: This is the "root" binary (written in bash) file of Kiwipanel. It is used to start and stop the Kiwipanel service. Sometimes you might use this binary to fix the permissions of the Kiwipanel binary file (written in Golang), if any. Normally everything is fine.
- `/opt/kiwipanel/ssl/panel`: Contains the SSL certificate files. After installing you will get two files: kiwipanel.key and kiwipanel.crt. These files are used to secure the panel and this is self-signed certificate (IP:8443).
- `/home/kiwiweb/default_site/index.html`: This is the default index file when you visit the IP address of your VPS.
- `/opt/kiwipanel`: This is the core directory where Kiwipanel is installed. `/opt/kiwipanel/{bin, config, data, logs, meta, scripts, ssl, templates}`: The binary file, the config file, the logs... of Kiwipanel are all located here.

## Generated locations for users
- `/home/linux_user/domain.com/public_html`: This is the home directory for each domain.
