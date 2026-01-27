# Voice Rooms - Design Document

## Overview

A simple voice room application where:
- Anyone can create/join rooms and talk browser-to-browser
- Users who know the shared password can dial a SIP phone into the room
- Rooms auto-expire after 30 minutes of inactivity

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    DigitalOcean Droplet                 │
│                                                         │
│  ┌─────────────────┐       ┌─────────────────────────┐  │
│  │   Node.js App   │       │     Janus Gateway       │  │
│  │                 │       │                         │  │
│  │  - Room mgmt    │       │  - AudioBridge plugin   │  │
│  │  - Static files │       │    (browser↔browser)    │  │
│  │  - Session mgmt │       │                         │  │
│  │                 │       │  - SIP plugin           │  │
│  │                 │       │    (browser→SIP phone)  │  │
│  └────────┬────────┘       └──────────┬──────────────┘  │
│           │ :3000                     │ :8188 (WS)      │
└───────────┼───────────────────────────┼─────────────────┘
            │                           │
    ┌───────┴───────┐           ┌───────┴────────┐
    │    Browser    │           │    HT802 ATA   │
    │  (Vanilla JS) │           │   (SIP phone)  │
    └───────────────┘           └────────────────┘
```

**Components:**

1. **Node.js App** - Handles room state, serves the HTML/JS frontend. No media touches this.
2. **Janus Gateway** - Handles all WebRTC and SIP media. Browser connects directly via WebSocket.
3. **Browser** - Vanilla JS app that talks to both Node.js (for rooms) and Janus (for media).
4. **HT802** - Registers to Janus SIP plugin. When browser dials its extension, Janus bridges the audio.

## Tech Stack

- Node.js/TypeScript backend (Express)
- Vanilla JS/HTML frontend
- Janus Gateway for WebRTC + SIP media
- JSON file for config (shared SIP password)
- DigitalOcean droplet

## Access Model

| Action | Auth required? |
|--------|----------------|
| Create/join room (browser-to-browser) | No - open access |
| Dial SIP phone from room | Yes - must know the password |
| HT802 registers to Janus | Yes - same password |

Single shared password stored in `config.json`, used for both SIP calling and device registration.

## Room Flow

### Room Creation & Joining

```
Browser                     Node.js                    Janus
   │                            │                         │
   │  POST /api/rooms           │                         │
   │  {name: "My Room"}         │                         │
   │ ──────────────────────────>│                         │
   │                            │  create room record     │
   │                            │  roomId = 1001          │
   │  {roomId: 1001}            │                         │
   │ <──────────────────────────│                         │
   │                            │                         │
   │  (user clicks "join")      │                         │
   │                            │                         │
   │  WebSocket connect ───────────────────────────────>  │
   │  "create AudioBridge handle"                         │
   │ <─────────────────────────────────── handle created  │
   │                            │                         │
   │  "join room 1001" ────────────────────────────────>  │
   │              (Janus creates room if doesn't exist)   │
   │ <─────────────────────────────────── joined, audio   │
   │                            │                         │
   │  POST /api/rooms/1001/join │                         │
   │ ──────────────────────────>│                         │
   │                            │  update participant     │
   │                            │  list, reset expiry     │
```

### Room Expiry

Node.js runs a check every 60 seconds:
1. Find rooms with no activity for 30+ minutes
2. Call Janus Admin API to destroy the AudioBridge room
3. Delete room from Node.js state

## SIP Calling Flow

### HT802 Registration (one-time setup)

```
HT802 ATA                                        Janus SIP Plugin
    │                                                   │
    │  SIP REGISTER                                     │
    │  user: "phone1", password: "shared-secret"        │
    │ ─────────────────────────────────────────────────>│
    │                                                   │
    │  200 OK (registered)                              │
    │ <─────────────────────────────────────────────────│
```

### Browser Dials SIP Phone

```
Browser                          Janus                    HT802
   │                               │                         │
   │  (user in AudioBridge room)   │                         │
   │                               │                         │
   │  "dial phone1"                │                         │
   │  + password: "shared-secret"  │                         │
   │ ─────────────────────────────>│                         │
   │                               │  verify password        │
   │                               │                         │
   │                               │  SIP INVITE phone1      │
   │                               │ ───────────────────────>│
   │                               │                         │
   │                               │  180 Ringing            │
   │  "ringing"                    │ <───────────────────────│
   │ <─────────────────────────────│                         │
   │                               │                         │
   │                               │  200 OK (answered)      │
   │                               │ <───────────────────────│
   │                               │                         │
   │                               │  Audio bridged:         │
   │  <─────────────── RTP ───────>│<──────── RTP ──────────>│
   │                               │                         │
   │  (both parties can talk)      │                         │
```

Either party can hang up - Janus handles SIP BYE in both directions.

## Frontend UI

### Landing Page (`/`)

```
┌─────────────────────────────────────────────────────┐
│  Voice Rooms                                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Active Rooms                        [Create Room]  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Room: "Kitchen"                              │  │
│  │  1 participant · Created 5 min ago    [Join]  │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Room: "Office"                               │  │
│  │  2 participants · Created 12 min ago   (Full) │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- Room list auto-refreshes every 5 seconds
- Rooms with 2 participants show "(Full)" - not joinable
- "Create Room" prompts for a name, redirects to room

### Room View (`/room/:id`)

```
┌─────────────────────────────────────────────────────┐
│  Room: "Kitchen"                        [Leave]     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Participants:                                      │
│    • You                                            │
│    • Guest-7f3a                                     │
│                                                     │
│  ──────────────────────────────────────────────     │
│                                                     │
│  Call SIP Phone:                                    │
│  Extension: [phone1    ]  [Call]                    │
│                                                     │
│  (if call active)                                   │
│  Connected to phone1                 [Hang Up]      │
│                                                     │
│  ──────────────────────────────────────────────     │
│                                                     │
│  [Mute]  [Unmute]                                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- On join: browser requests microphone permission, connects to Janus AudioBridge
- "Call" button prompts for SIP password, then dials
- Mute/unmute controls local microphone

## Project Structure

```
sip-project/
├── server/
│   ├── index.ts              # Express app entry point
│   ├── routes/
│   │   └── rooms.ts          # Room API endpoints
│   ├── services/
│   │   ├── rooms.ts          # Room state management, expiry logic
│   │   └── janus.ts          # Janus Admin API client (for room cleanup)
│   └── config.json           # SIP password, Janus URL, etc.
│
├── public/
│   ├── index.html            # Landing page
│   ├── room.html             # Room view
│   ├── js/
│   │   ├── app.js            # Landing page logic
│   │   ├── room.js           # Room logic (join, leave, mute)
│   │   ├── janus.js          # Janus client library (official)
│   │   └── sip.js            # SIP calling logic
│   └── css/
│       └── style.css         # Minimal styling
│
├── janus/
│   └── janus.jcfg            # Janus config reference
│
├── package.json
├── tsconfig.json
└── README.md
```

## Deployment

### DigitalOcean Droplet

- Ubuntu 22.04 or 24.04
- Basic droplet (1GB RAM)
- Ports: 22 (SSH), 80/443 (web), 8188 (Janus WS), 5060 (SIP), 10000-10200 (RTP)

### Installing Janus

```bash
# Ubuntu packages
apt install janus janus-plugins

# Or via Docker
docker run -d --network host meetecho/janus-gateway
```

### Janus Config Files

| File | Purpose |
|------|---------|
| `janus.jcfg` | Main config - enable WebSocket transport |
| `janus.transport.websockets.jcfg` | WebSocket port (8188) |
| `janus.plugin.audiobridge.jcfg` | Enable AudioBridge, set RTP port range |
| `janus.plugin.sip.jcfg` | Enable SIP plugin, set local SIP port (5060) |

### HT802 Configuration

- SIP Server: `your-droplet-ip`
- SIP User ID: `phone1`
- Password: same as `sipPassword` in config.json
- Register Expiry: 60 seconds

### Running the App

```bash
pm2 start server/index.js --name voice-rooms
```

## Not Included (Intentionally)

- User accounts / registration
- Persistent call history
- Multiple SIP phones (easy to add later)
- HTTPS/SSL setup (documented but not automated)
