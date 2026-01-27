# Deployment Guide for Digital Ocean

Simple deployment from VSCode/Cursor to Digital Ocean using the `deploy.sh` script.

## Quick Summary

| Script | When to Run | Purpose |
|--------|-------------|---------|
| `setup-server.sh` | **Once** - when first creating the droplet | Installs all prerequisites (Node.js, PM2, Janus, Nginx, firewall) |
| `deploy.sh` | **Every time** - when deploying code changes | Deploys your code and restarts the app |
| `setup-nginx.sh` | **Optional** - only if Nginx wasn't configured | Configures Nginx reverse proxy (already included in setup-server.sh) |

## Deployment Workflow

### Step 1: Initial Server Setup (One-time, first time only)

When you first create your Digital Ocean Droplet, run `setup-server.sh` **once**:

```bash
# Run it directly from your local machine
ssh root@your-droplet-ip "bash -s" < setup-server.sh
```

Or copy and run on the server:
```bash
scp setup-server.sh root@your-droplet-ip:/tmp/
ssh root@your-droplet-ip "bash /tmp/setup-server.sh"
```

**What `setup-server.sh` does:**
- Installs Node.js 20
- Installs PM2 (process manager)
- Installs Janus Gateway
- Installs and configures Nginx as reverse proxy
- Configures firewall (ports 22, 80, 443, 8188, 5060, 10000-10200)
- Creates `/opt/voice-rooms` directory

**You only need to run this once** when setting up a new droplet.

### Step 2: Deploy Your Code (Every time you make changes)

After the initial setup, use `deploy.sh` to deploy code changes:

```bash
./deploy.sh your-droplet-ip
```

**What `deploy.sh` does:**
- Builds your project locally
- Syncs files to the server
- Installs dependencies (including dev dependencies for build)
- Builds TypeScript on the server
- Restarts the application with PM2

**Run this every time** you want to deploy code changes.

### When to use `setup-nginx.sh`?

The `setup-nginx.sh` script is **optional** and only needed if:
- You already ran `setup-server.sh` before Nginx configuration was added
- You need to reconfigure Nginx
- You want to set up Nginx separately

If you're setting up a fresh server, `setup-server.sh` already includes Nginx configuration, so you don't need `setup-nginx.sh`.

### Manual Setup

If you prefer to set up manually:

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

# 5. Configure Janus
# Edit /etc/janus/janus.transport.websockets.jcfg to enable WebSocket
# Edit /etc/janus/janus.plugin.audiobridge.jcfg
# Edit /etc/janus/janus.plugin.sip.jcfg

# 6. Start Janus
systemctl enable janus
systemctl start janus

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

## Droplet Requirements

When creating your Digital Ocean Droplet:
- **OS**: Ubuntu 22.04 or 24.04
- **RAM**: At least 1GB (2GB recommended for Janus)
- **Ports to open**: 22 (SSH), 80, 443, 8188 (Janus WS), 5060 (SIP), 10000-10200 (RTP)

## Deploy Script Usage

The `deploy.sh` script handles everything automatically:

```bash
# Basic usage
./deploy.sh your-droplet-ip

# With custom user (default is root)
./deploy.sh your-droplet-ip username

# Using environment variables
export DROPLET_IP=your-droplet-ip
export DROPLET_USER=root
./deploy.sh
```

**What it does:**
1. Builds your TypeScript project locally
2. Syncs files to `/opt/voice-rooms` on the server (excludes node_modules, .git, dist, config.json)
3. Installs Node.js automatically if missing
4. Installs npm dependencies
5. Builds the project on the server
6. Installs PM2 if missing
7. Restarts the application with PM2

## Configuration

Create `config.json` on the server at `/opt/voice-rooms/config.json`:

```json
{
  "port": 3000,
  "sipPassword": "your-secure-password",
  "janusUrl": "ws://localhost:8188/janus",
  "janusAdminUrl": "http://localhost:7088/admin",
  "janusAdminSecret": "your-janus-secret"
}
```

The deploy script preserves your `config.json` - it won't overwrite it.

## Environment Variables

You can also use environment variables. Create `/opt/voice-rooms/.env` on the server:
```bash
PORT=3000
NODE_ENV=production
```

## Troubleshooting

- **"npm: command not found"**: The deploy script will auto-install Node.js, but if it fails, run the setup script manually
- **Can't connect via SSH**: Check firewall, ensure SSH key is added to the droplet
- **Port conflicts**: Check what's using ports with `netstat -tulpn`
- **Janus not working**: Check logs with `journalctl -u janus -f`
- **PM2 not persisting**: Run `pm2 startup` and follow instructions
- **Application not starting**: Check PM2 logs with `pm2 logs voice-rooms`

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
