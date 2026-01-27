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

### 1. Install Janus

Ubuntu:
```bash
apt install janus
```

Or Docker:
```bash
docker run -d --network host meetecho/janus-gateway
```

### 2. Configure Janus

Enable WebSocket transport in `/etc/janus/janus.transport.websockets.jcfg`.

Enable AudioBridge and SIP plugins.

### 3. Install and Run

```bash
npm install
cp config.example.json config.json
# Edit config.json with your settings
npm run build
npm start
```

### 4. Configure SIP Device

On your HT802 or similar ATA:
- SIP Server: your server IP
- SIP User ID: phone1
- Password: same as sipPassword in config.json

## Configuration

Edit `config.json`:

| Key | Description |
|-----|-------------|
| port | HTTP server port (default: 3000) |
| sipPassword | Shared password for SIP access |
| janusUrl | Janus WebSocket URL |
| janusAdminUrl | Janus Admin API URL |
| janusAdminSecret | Janus admin secret |

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
