# Voice Rooms

Simple WebRTC voice rooms with SIP phone integration via Janus Gateway.

## Features

- Browser-to-browser voice calls
- Dial SIP phones (like Grandstream HT802) from browser
- Room list with auto-expiry (30 minutes inactive)
- No user accounts required for browser users
- Shared password for SIP access

## Requirements

- Node.js 18+
- Janus Gateway with AudioBridge and SIP plugins
- Ubuntu 22.04 or 24.04 (for server deployment)
- At least 1GB RAM (2GB recommended for Janus)

## Quick Start

### Scripts Overview

| Script | When to Run | Purpose |
|--------|-------------|---------|
| `setup.sh` | **Once** - when first creating the droplet | Installs all prerequisites (Node.js, PM2, Janus, Nginx, firewall) |
| `deploy.sh` | **Every time** - when deploying code changes | Deploys your code and restarts the app |
| `doctor.sh` | **Troubleshooting** - to check system health | Comprehensive health check of all services |

### Step 1: Initial Server Setup (One-time)

When you first create your Digital Ocean Droplet (or any Ubuntu server), run `setup.sh` **once**:

```bash
# Copy setup script to server
scp setup.sh root@your-server-ip:/tmp/

# Run it on the server
ssh root@your-server-ip "bash /tmp/setup.sh"
```

Or with a domain name for HTTPS:
```bash
scp setup.sh root@your-server-ip:/tmp/
ssh root@your-server-ip "DOMAIN_NAME=yourdomain.com bash /tmp/setup.sh"
```

**What `setup.sh` does:**
- Installs Node.js 20
- Installs PM2 (process manager)
- Installs Janus Gateway
- **Properly configures Janus admin API** (both main config and HTTP transport config)
- Installs and configures Nginx as reverse proxy
- Configures firewall (ports 22, 80, 443, 8188, 5060, 10000-10200)
- Creates `/opt/voice-rooms` directory
- Optionally sets up HTTPS with Let's Encrypt (if DOMAIN_NAME is provided)

**You only need to run this once** when setting up a new server.

### Step 2: Deploy Application

After setup, deploy your code:

```bash
./deploy.sh your-server-ip
```

**What `deploy.sh` does:**
- Builds your TypeScript project locally
- Syncs files to `/opt/voice-rooms` on the server (excludes node_modules, .git, dist, config.json)
- Installs Node.js automatically if missing
- Installs npm dependencies
- Builds the project on the server
- Installs PM2 if missing
- Restarts the application with PM2

**Run this every time** you want to deploy code changes.

**Deploy script usage:**
```bash
# Basic usage
./deploy.sh your-server-ip

# With custom user (default is root)
./deploy.sh your-server-ip username

# Using environment variables
export DROPLET_IP=your-server-ip
export DROPLET_USER=root
./deploy.sh
```

The deployment script will create `config.json` automatically. You may need to edit it to set your SIP password.

### Step 3: Configure SIP Device

On your HT802 or similar ATA:
- SIP Server: your server IP
- SIP User ID: phone1
- Password: same as sipPassword in config.json

## Configuration

The `config.json` file is created automatically during deployment at `/opt/voice-rooms/config.json`. You may need to edit it to set your SIP password:

```json
{
  "port": 3000,
  "sipPassword": "your-shared-secret",
  "janusUrl": "ws://localhost:8188/janus",
  "janusAdminUrl": "http://localhost:7088/admin",
  "janusAdminSecret": "janusoverlord"
}
```

| Key | Description |
|-----|-------------|
| port | HTTP server port (default: 3000) |
| sipPassword | Shared password for SIP access (change this!) |
| janusUrl | Janus WebSocket URL |
| janusAdminUrl | Janus Admin API URL |
| janusAdminSecret | Janus admin secret (set by setup.sh, default: "janusoverlord") |

The deploy script preserves your `config.json` - it won't overwrite it.

### Environment Variables

You can also use environment variables. Create `/opt/voice-rooms/.env` on the server:
```bash
PORT=3000
NODE_ENV=production
```

## Usage

1. Open http://localhost:3000 (or your server IP/domain)
2. Create a room
3. Share room URL with another person
4. To call SIP phone: enter extension and password

## Architecture

```
Browser <--WebSocket--> Janus AudioBridge <--RTP--> Browser
                             |
                        Janus SIP Plugin <--SIP/RTP--> HT802 ATA

Node.js server: room state, static files
```

## Server Requirements

When creating your Digital Ocean Droplet (or any server):
- **OS**: Ubuntu 22.04 or 24.04
- **RAM**: At least 1GB (2GB recommended for Janus)
- **Ports to open**: 22 (SSH), 80, 443, 8188 (Janus WS), 5060 (SIP), 10000-10200 (RTP)

## Manual Setup

If you prefer to set up manually instead of using `setup.sh`:

```bash
# 1. Update system
apt update && apt upgrade -y

# 2. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 3. Install PM2 (process manager)
npm install -g pm2

# 4. Install Janus Gateway
apt install -y janus

# 5. Configure Janus admin API
# Add admin_secret to /etc/janus/janus.jcfg in general section:
#   admin_secret = "your-secret-here"
# Add admin_http section to /etc/janus/janus.jcfg:
#   admin_http: {
#       admin_http = true
#       admin_http_port = 7088
#   }
# Enable admin_http in /etc/janus/janus.transport.http.jcfg:
#   In the admin: section, set: admin_http = true

# 6. Start Janus
systemctl enable janus
systemctl restart janus

# 7. Configure firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8188/tcp
ufw allow 5060/udp
ufw allow 10000:10200/udp
ufw enable

# 8. Set up Nginx reverse proxy (optional but recommended)
apt install -y nginx
# Configure /etc/nginx/sites-available/voice-rooms
# Enable with: ln -s /etc/nginx/sites-available/voice-rooms /etc/nginx/sites-enabled/
```

## Troubleshooting

### Health Check

Run the health check script on your server:

```bash
ssh root@your-server-ip "bash /opt/voice-rooms/doctor.sh"
```

This will check all services and identify issues:
- Node.js and PM2 status
- Janus Gateway status and configuration
- Nginx status
- Application health
- Firewall configuration
- Recent error logs

### Common Issues

#### Janus Admin API Not Working

If port 7088 is not listening or Janus has configuration errors, you can:

**Option 1: Re-run setup script (recommended)**
The setup script is mostly idempotent and will fix Janus configuration:
```bash
ssh root@your-server-ip "bash /tmp/setup.sh"
```

**Option 2: Manual fix**
The most common issue is that `admin_http = false` in the HTTP transport config file:
1. Edit `/etc/janus/janus.transport.http.jcfg`
2. Find the `admin:` section
3. Change `admin_http = false` to `admin_http = true`
4. Ensure `admin_port = 7088` is set
5. Also verify `/etc/janus/janus.jcfg` has:
   ```
   admin_http: {
       admin_http = true
       admin_http_port = 7088
   }
   ```
6. Restart Janus: `systemctl restart janus`

#### Nginx "no live upstreams" Error

If Nginx shows "no live upstreams" errors:
1. Check if the app is running: `pm2 list`
2. Verify Nginx proxy_pass points to the correct port: `grep proxy_pass /etc/nginx/sites-available/voice-rooms`
3. Should show: `proxy_pass http://localhost:3000;`

#### Other Common Issues

- **"npm: command not found"**: The deploy script will auto-install Node.js, but if it fails, run the setup script manually
- **Can't connect via SSH**: Check firewall, ensure SSH key is added to the droplet
- **Port conflicts**: Check what's using ports with `netstat -tulpn` or `ss -tuln`
- **PM2 not persisting**: Run `pm2 startup` and follow instructions
- **Application not starting**: Check PM2 logs with `pm2 logs voice-rooms`

For more detailed troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## PM2 Commands

Once deployed, you can manage the application with PM2:

```bash
# View status
pm2 status

# View logs
pm2 logs voice-rooms

# Restart
pm2 restart voice-rooms

# Stop
pm2 stop voice-rooms

# Monitor
pm2 monit
```
