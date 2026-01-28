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

## Quick Start

### Server Setup

Run the automated setup script on your server:

```bash
./setup.sh
```

For HTTPS with Let's Encrypt:
```bash
DOMAIN_NAME=yourdomain.com ./setup.sh
```

This script will:
- Install Node.js, PM2, Janus Gateway, and Nginx
- Configure Janus with admin API
- Set up Nginx reverse proxy
- Configure firewall rules
- Optionally set up HTTPS with Let's Encrypt

### Deploy Application

After setup, deploy your code:

```bash
./deploy.sh your-server-ip
```

The deployment script will create `config.json` automatically. You may need to edit it to set your SIP password.

### Configure SIP Device

On your HT802 or similar ATA:
- SIP Server: your server IP
- SIP User ID: phone1
- Password: same as sipPassword in config.json

## Configuration

The `config.json` file is created automatically during deployment. You may need to edit it to set your SIP password:

```json
{
  "port": 3000,
  "sipPassword": "your-shared-secret",
  "janusUrl": "ws://localhost:8188",
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
| janusAdminSecret | Janus admin secret (set by setup.sh) |

## Usage

1. Open http://localhost:3000
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
