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
│  ┌───────────────────────────────────────────────────┐  │
│  │            Node.js App                            │  │
│  │                                                    │  │
│  │  - Room mgmt (HTTP API)                           │  │
│  │  - Static files (HTML/JS/CSS)                     │  │
│  │  - SIP Server (signaling only, port 5060)         │  │
│  │    • REGISTER handling                            │  │
│  │    • INVITE routing                               │  │
│  │    • Call state management                        │  │
│  └──────────────┬────────────────────────────────────┘  │
│                 │ :3000 (HTTP)                          │
│                 │ :5060 (SIP/UDP)                      │
│                 │                                       │
│  ┌──────────────┴────────────────────────────────────┐  │
│  │            Janus Gateway                          │  │
│  │                                                    │  │
│  │  - AudioBridge plugin (browser↔browser mixing)    │  │
│  │  - SIP plugin (WebRTC↔SIP media bridge)          │  │
│  └──────────────┬────────────────────────────────────┘  │
│                 │ :8188 (WebSocket)                     │
│                 │ :10000-10200 (RTP/UDP)                 │
└─────────────────┼───────────────────────────────────────┘
                  │
    ┌─────────────┴─────────────┐           ┌──────────────┐
    │      Browser              │           │  GDMS Device │
    │   (Vanilla JS/WebRTC)     │           │  (SIP phone) │
    └───────────────────────────┘           └──────────────┘
```

**Components:**

1. **Node.js App** - Handles room state, serves HTML/JS frontend, **runs lightweight SIP server for signaling** (port 5060). SIP server only handles protocol messages, no media processing.
2. **Janus Gateway** - Handles all WebRTC and SIP media. Browser connects via WebSocket. Janus SIP plugin connects to Node.js SIP server as a client.
3. **Browser** - Vanilla JS app that talks to both Node.js (for rooms) and Janus (for media via WebRTC).
4. **GDMS Device** - Registers to Node.js SIP server. When browser dials via Janus, Janus connects to Node.js SIP server which routes to the device.

**Protocol Separation:**
- **Signaling**: SIP protocol (UDP port 5060) - handled by Node.js SIP server
- **Media**: RTP/WebRTC - handled by Janus Gateway

## Tech Stack

- Node.js/TypeScript backend (Express)
  - Lightweight SIP server library (e.g., `sip.js` or custom UDP server)
- Vanilla JS/HTML frontend
- Janus Gateway for WebRTC + SIP media bridging
- JSON file for config (shared SIP password)
- DigitalOcean droplet

## Access Model

| Action | Auth required? |
|--------|----------------|
| Create/join room (browser-to-browser) | No - open access |
| Dial SIP phone from room | Yes - must know the password |
| GDMS device registers to Node.js SIP server | Yes - same password |

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

### GDMS Device Registration (one-time setup)

**Protocol:** SIP/UDP on port 5060

```
GDMS Device                                    Node.js SIP Server
    │                                                   │
    │  REGISTER sip:phone1@server:5060 SIP/2.0         │
    │  Via: SIP/2.0/UDP device-ip:5060                 │
    │  From: <sip:phone1@server>                       │
    │  To: <sip:phone1@server>                         │
    │  Contact: <sip:phone1@device-ip:5060>            │
    │  Authorization: Digest username="phone1",        │
    │                  realm="server",                 │
    │                  password="shared-secret"        │
    │  Expires: 3600                                   │
    │ ────────────────────────────────────────────────>│
    │                                                   │
    │  (Node.js validates password, stores registration)│
    │                                                   │
    │  SIP/2.0 200 OK                                  │
    │  From: <sip:phone1@server>                       │
    │  To: <sip:phone1@server>                         │
    │  Contact: <sip:phone1@device-ip:5060>;expires=3600│
    │ <───────────────────────────────────────────────│
    │                                                   │
    │  (Device registered, will refresh every 3600s)   │
```

**Messages:**
- **REGISTER** (SIP/UDP) - Device registers with username/password
- **200 OK** (SIP/UDP) - Server confirms registration

**Protocol Details:**
- Transport: UDP on port 5060
- Authentication: SIP Digest (username + password)
- Registration stored in Node.js memory/database
- Device must re-register before expiry (typically every 3600 seconds)

### Browser Dials GDMS Device - Complete Flow

**Step 1: User Initiates Call (Browser → Janus)**

```
Browser                          Janus SIP Plugin
    │                               │
    │  WebSocket (JSON)             │
    │  {                             │
    │    "janus": "message",         │
    │    "body": {                   │
    │      "request": "register",    │
    │      "username": "sip:webuser@localhost",│
    │      "secret": "shared-secret",│
    │      "proxy": "sip:localhost:5060"│
    │    }                           │
    │  }                             │
    │ ──────────────────────────────>│
    │                               │
    │  (Janus SIP plugin validates password)│
    │                               │
    │  WebSocket (JSON)             │
    │  {                             │
    │    "sip": "event",             │
    │    "result": {                 │
    │      "event": "registered"    │
    │    }                           │
    │  }                             │
    │ <─────────────────────────────│
```

**Protocol:** WebSocket (JSON) on port 8188

**Step 2: Janus Registers with Node.js SIP Server**

```
Janus SIP Plugin                    Node.js SIP Server
    │                                   │
    │  REGISTER sip:webuser@localhost:5060 SIP/2.0│
    │  Via: SIP/2.0/UDP localhost:random-port      │
    │  From: <sip:webuser@localhost>               │
    │  To: <sip:webuser@localhost>                 │
    │  Contact: <sip:webuser@janus-ip:port>        │
    │  Authorization: Digest username="webuser",   │
    │                  realm="localhost",          │
    │                  password="shared-secret"    │
    │  Expires: 3600                                │
    │ ────────────────────────────────────────────>│
    │                                   │
    │  (Node.js validates, stores Janus registration)│
    │                                   │
    │  SIP/2.0 200 OK                  │
    │  Contact: <sip:webuser@janus-ip:port>;expires=3600│
    │ <───────────────────────────────────────────│
```

**Protocol:** SIP/UDP on port 5060

**Step 3: Browser Initiates Call to GDMS Device**

```
Browser                          Janus SIP Plugin
    │                               │
    │  WebSocket (JSON)             │
    │  {                             │
    │    "janus": "message",         │
    │    "body": {                   │
    │      "request": "call",        │
    │      "uri": "sip:phone1@localhost"│
    │    }                           │
    │  }                             │
    │ ──────────────────────────────>│
```

**Protocol:** WebSocket (JSON) on port 8188

**Step 4: Janus Sends INVITE to Node.js SIP Server**

```
Janus SIP Plugin                    Node.js SIP Server
    │                                   │
    │  INVITE sip:phone1@localhost:5060 SIP/2.0│
    │  Via: SIP/2.0/UDP janus-ip:port          │
    │  From: <sip:webuser@localhost>            │
    │  To: <sip:phone1@localhost>               │
    │  Contact: <sip:webuser@janus-ip:port>    │
    │  Call-ID: unique-call-id                  │
    │  CSeq: 1 INVITE                           │
    │  Content-Type: application/sdp            │
    │  Content-Length: <sdp-length>             │
    │                                           │
    │  v=0                                      │
    │  o=janus ...                              │
    │  c=IN IP4 janus-ip                       │
    │  m=audio <rtp-port> RTP/AVP 0 8 96      │
    │  a=rtpmap:0 PCMU/8000                    │
    │  a=rtpmap:8 PCMA/8000                    │
    │  ...                                      │
    │ ────────────────────────────────────────>│
    │                                   │
    │  (Node.js looks up phone1 registration)   │
    │  (Routes INVITE to registered device)      │
```

**Protocol:** SIP/UDP on port 5060  
**SDP:** Contains RTP media information (codecs, IP, ports)

**Step 5: Node.js Routes INVITE to GDMS Device**

```
Node.js SIP Server                  GDMS Device
    │                                   │
    │  INVITE sip:phone1@device-ip:5060 SIP/2.0│
    │  Via: SIP/2.0/UDP server-ip:5060         │
    │  Via: SIP/2.0/UDP janus-ip:port          │
    │  From: <sip:webuser@localhost>            │
    │  To: <sip:phone1@localhost>               │
    │  Call-ID: unique-call-id                  │
    │  CSeq: 1 INVITE                           │
    │  Content-Type: application/sdp            │
    │  Content-Length: <sdp-length>             │
    │                                           │
    │  v=0                                      │
    │  o=janus ...                              │
    │  c=IN IP4 janus-ip                       │
    │  m=audio <rtp-port> RTP/AVP 0 8 96      │
    │  ...                                      │
    │ ────────────────────────────────────────>│
    │                                   │
    │  (Device starts ringing)                  │
    │                                   │
    │  SIP/2.0 180 Ringing              │
    │  Via: SIP/2.0/UDP server-ip:5060         │
    │  From: <sip:webuser@localhost>            │
    │  To: <sip:phone1@localhost>;tag=device-tag│
    │  Call-ID: unique-call-id                  │
    │  CSeq: 1 INVITE                           │
    │ <─────────────────────────────────────────│
```

**Protocol:** SIP/UDP on port 5060

**Step 6: Ringing Response Propagates Back**

```
GDMS Device                    Node.js SIP Server                    Janus SIP Plugin
    │                                   │                                   │
    │  180 Ringing                      │                                   │
    │ ─────────────────────────────────>│                                   │
    │                                   │  180 Ringing                      │
    │                                   │ ─────────────────────────────────>│
    │                                   │                                   │
    │                                   │                                   │  WebSocket (JSON)
    │                                   │                                   │  {
    │                                   │                                   │    "sip": "event",
    │                                   │                                   │    "result": {
    │                                   │                                   │      "event": "calling"
    │                                   │                                   │    }
    │                                   │                                   │  }
    │                                   │                                   │ <───────────────────
    │                                   │                                   │
    │                                   │                                   │  (Browser shows "Ringing...")
```

**Protocol:** SIP/UDP (signaling), WebSocket/JSON (to browser)

**Step 7: Device Answers - Media Established**

```
GDMS Device                    Node.js SIP Server                    Janus SIP Plugin
    │                                   │                                   │
    │  SIP/2.0 200 OK                   │                                   │
    │  From: <sip:webuser@localhost>     │                                   │
    │  To: <sip:phone1@localhost>;tag=device-tag│                          │
    │  Contact: <sip:phone1@device-ip:5060>│                                │
    │  Content-Type: application/sdp     │                                   │
    │                                    │                                   │
    │  v=0                               │                                   │
    │  o=device ...                     │                                   │
    │  c=IN IP4 device-ip                │                                   │
    │  m=audio <device-rtp-port> RTP/AVP 0 8│                              │
    │  ...                               │                                   │
    │ ─────────────────────────────────>│                                   │
    │                                    │  200 OK                           │
    │                                    │ ─────────────────────────────────>│
    │                                    │                                   │
    │                                    │                                   │  WebSocket (JSON)
    │                                    │                                   │  {
    │                                    │                                   │    "sip": "event",
    │                                    │                                   │    "result": {
    │                                    │                                   │      "event": "accepted",
    │                                    │                                   │      "sdp": "..."
    │                                    │                                   │    }
    │                                    │                                   │  }
    │                                    │                                   │ <───────────────────
    │                                    │                                   │
    │                                    │                                   │  (Browser establishes WebRTC)
```

**Protocol:** SIP/UDP (signaling), WebSocket/JSON (to browser)

**Step 8: Audio Media Flow - How GDMS Audio Reaches Browser**

**Important:** WebSocket is ONLY for signaling (JSON messages). Audio flows via WebRTC (UDP) directly, not through WebSocket.

When a SIP call is active, the browser user is still in the AudioBridge room. Janus bridges the SIP call into the AudioBridge room, so all participants (browser users + SIP device) can hear each other.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Audio Flow Architecture                          │
└─────────────────────────────────────────────────────────────────────┘

Browser (in AudioBridge room)        Janus Gateway                    GDMS Device
    │                               │                                   │
    │                               │  ┌─────────────────────────────┐  │
    │                               │  │  AudioBridge Room           │  │
    │                               │  │  (mixes all participants)   │  │
    │                               │  └───────────┬─────────────────┘  │
    │                               │              │                      │
    │                               │  ┌───────────┴─────────────────┐  │
    │                               │  │  SIP Plugin                 │  │
    │                               │  │  (bridges SIP ↔ AudioBridge)│  │
    │                               │  └───────────┬─────────────────┘  │
    │                               │              │                      │
    │                               │              │                      │
    │  WebRTC (DTLS-SRTP/UDP)       │              │                      │
    │  Audio: Opus/PCM              │              │                      │
    │  Port: Dynamic (10000-65535)  │              │                      │
    │ ─────────────────────────────>│              │                      │
    │                               │  (AudioBridge receives browser audio)│
    │                               │              │                      │
    │                               │              │  RTP/UDP              │
    │                               │              │  Audio: PCMU/PCMA    │
    │                               │              │  Port: 10000-10200    │
    │                               │              │ ────────────────────>│
    │                               │              │                      │
    │                               │              │  RTP/UDP              │
    │                               │              │  Audio: PCMU/PCMA    │
    │                               │              │ <─────────────────────│
    │                               │  (SIP Plugin receives GDMS audio)   │
    │                               │              │                      │
    │                               │  (SIP Plugin bridges RTP into       │
    │                               │   AudioBridge room)                 │
    │                               │              │                      │
    │                               │  (AudioBridge mixes:                │
    │                               │   - Browser audio                  │
    │                               │   - GDMS audio                     │
    │                               │   - Other browser participants)   │
    │                               │              │                      │
    │  WebRTC (DTLS-SRTP/UDP)       │              │                      │
    │  Audio: Opus/PCM              │              │                      │
    │  (Mixed audio from room)      │              │                      │
    │ <─────────────────────────────│              │                      │
    │                               │              │                      │
    │  (Browser hears:              │              │                      │
    │   - Other browser users       │              │                      │
    │   - GDMS device)              │              │                      │
```

**Detailed Audio Routing:**

1. **Browser → Janus:**
   - Protocol: WebRTC (DTLS-SRTP) over UDP
   - Port: Dynamic (negotiated via ICE, typically 10000-65535)
   - Codec: Opus or PCM (browser's choice)
   - Path: Browser microphone → WebRTC → Janus AudioBridge plugin

2. **GDMS → Janus:**
   - Protocol: RTP/UDP
   - Port: 10000-10200 (configurable in Janus)
   - Codec: PCMU (G.711 μ-law) or PCMA (G.711 A-law)
   - Path: GDMS device → RTP → Janus SIP plugin

3. **Janus Internal Bridging:**
   - SIP plugin receives RTP from GDMS
   - SIP plugin bridges RTP stream into AudioBridge room
   - AudioBridge mixes all audio streams:
     - All browser participants' audio
     - GDMS device audio
   - AudioBridge sends mixed audio to all participants

4. **Janus → Browser:**
   - Protocol: WebRTC (DTLS-SRTP) over UDP
   - Port: Dynamic (same connection as step 1)
   - Codec: Opus or PCM (browser's choice)
   - Content: Mixed audio from AudioBridge (all participants + GDMS)
   - Path: Janus AudioBridge → WebRTC → Browser speakers

**Key Points:**
- **WebSocket (port 8188):** Only for signaling - JSON messages for call control, NOT audio
- **WebRTC (UDP, dynamic ports):** Direct peer-to-peer-like connection for audio between browser and Janus
- **RTP (UDP, ports 10000-10200):** Audio between Janus and GDMS device
- **AudioBridge:** Mixes all audio sources and distributes to all participants
- **Codec Transcoding:** Janus automatically transcodes between WebRTC codecs (Opus/PCM) and SIP codecs (PCMU/PCMA)

**Step 9: Call Termination (Hangup)**

```
Browser                          Janus SIP Plugin                    Node.js SIP Server                    GDMS Device
    │                               │                                   │                                   │
    │  WebSocket (JSON)             │                                   │                                   │
    │  {"request": "hangup"}        │                                   │                                   │
    │ ─────────────────────────────>│                                   │                                   │
    │                               │  BYE sip:phone1@localhost SIP/2.0│                                   │
    │                               │ ─────────────────────────────────>│                                   │
    │                               │                                   │  BYE sip:phone1@device-ip:5060 SIP/2.0│
    │                               │                                   │ ─────────────────────────────────>│
    │                               │                                   │                                   │
    │                               │                                   │  SIP/2.0 200 OK                   │
    │                               │                                   │ <─────────────────────────────────│
    │                               │  SIP/2.0 200 OK                   │                                   │
    │                               │ <─────────────────────────────────│                                   │
    │                               │                                   │                                   │
    │  WebSocket (JSON)             │                                   │                                   │
    │  {"event": "hangup"}          │                                   │                                   │
    │ <─────────────────────────────│                                   │                                   │
```

**Protocol:** SIP/UDP (BYE message), WebSocket/JSON (to browser)

## Audio Routing Summary

**Critical Understanding:** WebSocket and audio are completely separate:

1. **WebSocket (port 8188):**
   - Purpose: Signaling only - JSON messages for call control
   - Used for: "Call", "Hangup", "Ringing", "Accepted" events
   - Does NOT carry audio

2. **WebRTC (UDP, dynamic ports):**
   - Purpose: Audio media between browser and Janus
   - Established via: SDP exchange over WebSocket (signaling)
   - Uses: DTLS-SRTP encryption
   - Codecs: Opus, PCM (browser choice)
   - Direct UDP connection, not through WebSocket

3. **AudioBridge Room:**
   - When browser joins room: AudioBridge receives browser's WebRTC audio
   - When SIP call active: SIP plugin bridges GDMS RTP into AudioBridge
   - AudioBridge mixes: All browser participants + GDMS device
   - AudioBridge sends: Mixed audio to all participants via WebRTC

4. **Complete Audio Path (GDMS → Browser):**
   ```
   GDMS Device
      ↓ RTP/UDP (PCMU/PCMA)
   Janus SIP Plugin
      ↓ (bridges into AudioBridge)
   AudioBridge Room
      ↓ (mixes with browser audio)
   AudioBridge Room
      ↓ WebRTC/DTLS-SRTP (Opus/PCM)
   Browser
   ```

5. **Complete Audio Path (Browser → GDMS):**
   ```
   Browser
      ↓ WebRTC/DTLS-SRTP (Opus/PCM)
   AudioBridge Room
      ↓ (mixes with other participants)
   AudioBridge Room
      ↓ (SIP plugin extracts audio)
   Janus SIP Plugin
      ↓ RTP/UDP (PCMU/PCMA)
   GDMS Device
   ```

## Protocol Summary

| Stage | Protocol | Port | Direction | Purpose |
|-------|----------|------|-----------|---------|
| Device Registration | SIP/UDP | 5060 | GDMS → Node.js | Register device |
| Janus Registration | SIP/UDP | 5060 | Janus → Node.js | Register Janus as SIP client |
| Call Initiation | WebSocket/JSON | 8188 | Browser → Janus | User clicks "Call" |
| INVITE Signaling | SIP/UDP | 5060 | Janus ↔ Node.js ↔ GDMS | Call setup |
| Ringing/Answer | SIP/UDP | 5060 | GDMS → Node.js → Janus | Call progress |
| Media (Audio) | RTP/UDP | 10000-10200 | Janus ↔ GDMS | Audio stream (SIP device) |
| Media (Audio) | WebRTC/DTLS-SRTP | Dynamic (UDP) | Browser ↔ Janus | Audio stream (WebRTC, NOT WebSocket) |
| Signaling | WebSocket/JSON | 8188 | Browser ↔ Janus | Call control only, NOT audio |
| Hangup | SIP/UDP | 5060 | Any → All | Call termination |

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
│   │   ├── janus.ts          # Janus Admin API client (for room cleanup)
│   │   └── sip.ts            # SIP server (REGISTER, INVITE routing)
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
| `janus.plugin.sip.jcfg` | Enable SIP plugin (connects to Node.js SIP server) |

### Node.js SIP Server Configuration

- **Port:** 5060 (UDP) - standard SIP port
- **Functionality:**
  - Accept REGISTER requests from SIP devices
  - Accept REGISTER requests from Janus SIP plugin
  - Route INVITE messages between Janus and SIP devices
  - Handle BYE, CANCEL, and other SIP messages
  - Store registration state (username → contact URI)

### GDMS Device Configuration

- **SIP Server:** `your-droplet-ip:5060`
- **SIP User ID:** `phone1` (or extension number)
- **Password:** same as `sipPassword` in config.json
- **Register Expiry:** 3600 seconds (1 hour)
- **Transport:** UDP

### Running the App

```bash
pm2 start server/index.js --name voice-rooms
```

## Not Included (Intentionally)

- User accounts / registration
- Persistent call history
- Multiple SIP phones (easy to add later)
- HTTPS/SSL setup (documented but not automated)
