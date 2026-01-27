# Voice Rooms Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a WebRTC voice room application with browser-to-browser and browser-to-SIP calling via Janus Gateway.

**Architecture:** Node.js/Express serves a vanilla JS frontend and manages room state. Janus Gateway handles all media (WebRTC AudioBridge for browser audio, SIP plugin for phone calls). Browser connects to both: Node.js for room coordination, Janus for media.

**Tech Stack:** Node.js, TypeScript, Express, Janus Gateway, Vanilla JS, HTML/CSS

---

## Phase 1: Project Setup

### Task 1: Initialize Node.js Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `server/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "voice-rooms",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch & node --watch dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./server",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["server/**/*"]
}
```

**Step 3: Create minimal server**

Create `server/index.ts`:

```typescript
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

**Step 4: Install dependencies**

Run: `npm install`
Expected: node_modules created, package-lock.json created

**Step 5: Build and verify**

Run: `npm run build && npm start`
Expected: "Server running on http://localhost:3000"

Test: `curl http://localhost:3000/api/health`
Expected: `{"status":"ok"}`

**Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json server/
git commit -m "feat: initialize Node.js/TypeScript project with Express"
```

---

### Task 2: Create Landing Page

**Files:**
- Create: `public/index.html`
- Create: `public/css/style.css`
- Create: `public/js/app.js`

**Step 1: Create HTML structure**

Create `public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voice Rooms</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header>
    <h1>Voice Rooms</h1>
  </header>
  <main>
    <section id="room-list-section">
      <div class="section-header">
        <h2>Active Rooms</h2>
        <button id="create-room-btn">Create Room</button>
      </div>
      <div id="room-list">
        <p class="empty-message">No active rooms</p>
      </div>
    </section>
  </main>

  <dialog id="create-room-dialog">
    <form method="dialog">
      <h3>Create Room</h3>
      <label for="room-name">Room Name</label>
      <input type="text" id="room-name" required maxlength="50">
      <div class="dialog-buttons">
        <button type="button" id="cancel-create">Cancel</button>
        <button type="submit">Create</button>
      </div>
    </form>
  </dialog>

  <script src="/js/app.js"></script>
</body>
</html>
```

**Step 2: Create CSS**

Create `public/css/style.css`:

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
  line-height: 1.5;
}

header {
  background: #2563eb;
  color: white;
  padding: 1rem 2rem;
}

main {
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

button {
  background: #2563eb;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

button:hover {
  background: #1d4ed8;
}

button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

#room-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.room-card {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.room-info h3 {
  font-size: 1.1rem;
  margin-bottom: 0.25rem;
}

.room-info p {
  color: #666;
  font-size: 0.9rem;
}

.room-full {
  color: #9ca3af;
  font-style: italic;
}

.empty-message {
  color: #666;
  text-align: center;
  padding: 2rem;
}

dialog {
  border: none;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}

dialog::backdrop {
  background: rgba(0,0,0,0.5);
}

dialog h3 {
  margin-bottom: 1rem;
}

dialog label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 500;
}

dialog input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  margin-bottom: 1rem;
}

.dialog-buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.dialog-buttons button[type="button"] {
  background: #6b7280;
}
```

**Step 3: Create JavaScript**

Create `public/js/app.js`:

```javascript
const roomList = document.getElementById('room-list');
const createRoomBtn = document.getElementById('create-room-btn');
const createRoomDialog = document.getElementById('create-room-dialog');
const cancelCreateBtn = document.getElementById('cancel-create');
const roomNameInput = document.getElementById('room-name');

async function fetchRooms() {
  try {
    const response = await fetch('/api/rooms');
    const rooms = await response.json();
    renderRooms(rooms);
  } catch (error) {
    console.error('Failed to fetch rooms:', error);
  }
}

function renderRooms(rooms) {
  if (rooms.length === 0) {
    roomList.innerHTML = '<p class="empty-message">No active rooms</p>';
    return;
  }

  roomList.innerHTML = rooms.map(room => {
    const isFull = room.participants >= 2;
    const timeAgo = getTimeAgo(room.createdAt);

    return `
      <div class="room-card">
        <div class="room-info">
          <h3>${escapeHtml(room.name)}</h3>
          <p>${room.participants} participant${room.participants !== 1 ? 's' : ''} · Created ${timeAgo}</p>
        </div>
        ${isFull
          ? '<span class="room-full">(Full)</span>'
          : `<button onclick="joinRoom('${room.id}')">Join</button>`
        }
      </div>
    `;
  }).join('');
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function createRoom(name) {
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const room = await response.json();
    window.location.href = `/room.html?id=${room.id}`;
  } catch (error) {
    console.error('Failed to create room:', error);
    alert('Failed to create room');
  }
}

function joinRoom(roomId) {
  window.location.href = `/room.html?id=${roomId}`;
}

// Event listeners
createRoomBtn.addEventListener('click', () => {
  roomNameInput.value = '';
  createRoomDialog.showModal();
});

cancelCreateBtn.addEventListener('click', () => {
  createRoomDialog.close();
});

createRoomDialog.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = roomNameInput.value.trim();
  if (name) {
    createRoom(name);
  }
});

// Initial load and polling
fetchRooms();
setInterval(fetchRooms, 5000);
```

**Step 4: Verify page loads**

Run: `npm run build && npm start`
Open: http://localhost:3000
Expected: Landing page displays with "No active rooms"

**Step 5: Commit**

```bash
git add public/
git commit -m "feat: add landing page with room list UI"
```

---

## Phase 2: Room Management API

### Task 3: Implement Room Service

**Files:**
- Create: `server/services/rooms.ts`
- Create: `server/types.ts`

**Step 1: Create types**

Create `server/types.ts`:

```typescript
export interface Room {
  id: string;
  name: string;
  participants: number;
  createdAt: number;
  lastActivity: number;
}

export interface CreateRoomRequest {
  name: string;
}
```

**Step 2: Create room service**

Create `server/services/rooms.ts`:

```typescript
import { Room } from '../types.js';

const rooms = new Map<string, Room>();

const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

export function createRoom(name: string): Room {
  const id = generateId();
  const now = Date.now();
  const room: Room = {
    id,
    name,
    participants: 0,
    createdAt: now,
    lastActivity: now
  };
  rooms.set(id, room);
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function getAllRooms(): Room[] {
  return Array.from(rooms.values());
}

export function joinRoom(id: string): Room | undefined {
  const room = rooms.get(id);
  if (!room || room.participants >= 2) {
    return undefined;
  }
  room.participants++;
  room.lastActivity = Date.now();
  return room;
}

export function leaveRoom(id: string): Room | undefined {
  const room = rooms.get(id);
  if (!room || room.participants <= 0) {
    return undefined;
  }
  room.participants--;
  room.lastActivity = Date.now();
  return room;
}

export function deleteRoom(id: string): boolean {
  return rooms.delete(id);
}

export function cleanupExpiredRooms(): string[] {
  const now = Date.now();
  const expiredIds: string[] = [];

  for (const [id, room] of rooms) {
    if (now - room.lastActivity > ROOM_EXPIRY_MS) {
      rooms.delete(id);
      expiredIds.push(id);
    }
  }

  return expiredIds;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}
```

**Step 3: Commit**

```bash
git add server/types.ts server/services/
git commit -m "feat: add room service with CRUD operations"
```

---

### Task 4: Implement Room Routes

**Files:**
- Create: `server/routes/rooms.ts`
- Modify: `server/index.ts`

**Step 1: Create room routes**

Create `server/routes/rooms.ts`:

```typescript
import { Router } from 'express';
import * as roomService from '../services/rooms.js';

const router = Router();

// List all rooms
router.get('/', (_req, res) => {
  const rooms = roomService.getAllRooms();
  res.json(rooms);
});

// Create room
router.post('/', (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Room name is required' });
    return;
  }

  if (name.length > 50) {
    res.status(400).json({ error: 'Room name too long' });
    return;
  }

  const room = roomService.createRoom(name.trim());
  res.status(201).json(room);
});

// Get room by ID
router.get('/:id', (req, res) => {
  const room = roomService.getRoom(req.params.id);

  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  res.json(room);
});

// Join room
router.post('/:id/join', (req, res) => {
  const room = roomService.joinRoom(req.params.id);

  if (!room) {
    res.status(400).json({ error: 'Cannot join room (not found or full)' });
    return;
  }

  res.json(room);
});

// Leave room
router.post('/:id/leave', (req, res) => {
  const room = roomService.leaveRoom(req.params.id);

  if (!room) {
    res.status(400).json({ error: 'Cannot leave room' });
    return;
  }

  res.json(room);
});

export default router;
```

**Step 2: Update server to use routes and cleanup**

Replace `server/index.ts`:

```typescript
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import roomRoutes from './routes/rooms.js';
import { cleanupExpiredRooms } from './services/rooms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/rooms', roomRoutes);

// Cleanup expired rooms every minute
setInterval(() => {
  const expired = cleanupExpiredRooms();
  if (expired.length > 0) {
    console.log(`Cleaned up ${expired.length} expired room(s)`);
  }
}, 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

**Step 3: Build and test API**

Run: `npm run build && npm start`

Test create room:
```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Room"}'
```
Expected: `{"id":"...","name":"Test Room","participants":0,"createdAt":...,"lastActivity":...}`

Test list rooms:
```bash
curl http://localhost:3000/api/rooms
```
Expected: Array containing the created room

**Step 4: Commit**

```bash
git add server/
git commit -m "feat: add room API routes with join/leave"
```

---

## Phase 3: Room Page & Janus Integration

### Task 5: Create Room Page HTML

**Files:**
- Create: `public/room.html`

**Step 1: Create room page**

Create `public/room.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Room - Voice Rooms</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/room.css">
</head>
<body>
  <header>
    <h1 id="room-title">Loading...</h1>
    <button id="leave-btn">Leave</button>
  </header>
  <main>
    <section id="participants-section">
      <h2>Participants</h2>
      <ul id="participant-list">
        <li>Connecting...</li>
      </ul>
    </section>

    <section id="sip-section">
      <h2>Call SIP Phone</h2>
      <div class="sip-controls">
        <input type="text" id="sip-extension" placeholder="Extension (e.g., phone1)">
        <button id="call-btn">Call</button>
      </div>
      <div id="call-status" class="hidden">
        <span id="call-status-text"></span>
        <button id="hangup-btn">Hang Up</button>
      </div>
    </section>

    <section id="audio-controls">
      <button id="mute-btn">Mute</button>
    </section>
  </main>

  <dialog id="password-dialog">
    <form method="dialog">
      <h3>Enter SIP Password</h3>
      <input type="password" id="sip-password" required>
      <div class="dialog-buttons">
        <button type="button" id="cancel-password">Cancel</button>
        <button type="submit">Call</button>
      </div>
    </form>
  </dialog>

  <script src="/js/janus.js"></script>
  <script src="/js/room.js"></script>
</body>
</html>
```

**Step 2: Create room-specific CSS**

Create `public/css/room.css`:

```css
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

header button {
  background: #dc2626;
}

header button:hover {
  background: #b91c1c;
}

section {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

section h2 {
  margin-bottom: 1rem;
  font-size: 1.1rem;
  color: #374151;
}

#participant-list {
  list-style: none;
}

#participant-list li {
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
}

#participant-list li:last-child {
  border-bottom: none;
}

.sip-controls {
  display: flex;
  gap: 0.5rem;
}

.sip-controls input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

#call-status {
  margin-top: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

#call-status-text {
  flex: 1;
}

#hangup-btn {
  background: #dc2626;
}

#audio-controls {
  display: flex;
  gap: 0.5rem;
}

#mute-btn.muted {
  background: #dc2626;
}

.hidden {
  display: none !important;
}

.error {
  color: #dc2626;
  padding: 1rem;
  background: #fef2f2;
  border-radius: 4px;
}
```

**Step 3: Commit**

```bash
git add public/room.html public/css/room.css
git commit -m "feat: add room page HTML and CSS"
```

---

### Task 6: Add Janus Client Library

**Files:**
- Create: `public/js/janus.js`

**Step 1: Download Janus.js**

The official Janus JavaScript library. For simplicity, we'll create a minimal version that handles our use case.

Create `public/js/janus.js`:

```javascript
// Minimal Janus client for AudioBridge and SIP plugins
// Based on official janus.js but simplified

class Janus {
  constructor(config) {
    this.server = config.server;
    this.iceServers = config.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }];
    this.onError = config.error || console.error;
    this.onDestroyed = config.destroyed || (() => {});

    this.ws = null;
    this.sessionId = null;
    this.handles = new Map();
    this.transactions = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.server, 'janus-protocol');

      this.ws.onopen = () => {
        this.sendMessage({ janus: 'create' })
          .then(response => {
            this.sessionId = response.data.id;
            this.startKeepalive();
            resolve();
          })
          .catch(reject);
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      };

      this.ws.onerror = (error) => {
        this.onError('WebSocket error', error);
        reject(error);
      };

      this.ws.onclose = () => {
        this.onDestroyed();
      };
    });
  }

  startKeepalive() {
    this.keepaliveInterval = setInterval(() => {
      this.sendMessage({ janus: 'keepalive', session_id: this.sessionId });
    }, 30000);
  }

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      const transaction = this.randomString(12);
      message.transaction = transaction;

      if (this.sessionId && !message.session_id) {
        message.session_id = this.sessionId;
      }

      this.transactions.set(transaction, { resolve, reject });
      this.ws.send(JSON.stringify(message));
    });
  }

  handleMessage(message) {
    const transaction = message.transaction;

    if (transaction && this.transactions.has(transaction)) {
      const { resolve, reject } = this.transactions.get(transaction);
      this.transactions.delete(transaction);

      if (message.janus === 'error') {
        reject(message.error);
      } else {
        resolve(message);
      }
      return;
    }

    // Handle async events
    if (message.sender) {
      const handle = this.handles.get(message.sender);
      if (handle) {
        handle.handleMessage(message);
      }
    }
  }

  attach(plugin) {
    return new Promise((resolve, reject) => {
      this.sendMessage({
        janus: 'attach',
        plugin: plugin.plugin
      }).then(response => {
        const handleId = response.data.id;
        plugin.handleId = handleId;
        plugin.janus = this;
        this.handles.set(handleId, plugin);
        resolve(plugin);
      }).catch(reject);
    });
  }

  destroy() {
    clearInterval(this.keepaliveInterval);
    if (this.ws) {
      this.ws.close();
    }
  }

  randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

class JanusPlugin {
  constructor(config) {
    this.plugin = config.plugin;
    this.onMessage = config.onmessage || (() => {});
    this.onLocalTrack = config.onlocaltrack || (() => {});
    this.onRemoteTrack = config.onremotetrack || (() => {});
    this.onCleanup = config.oncleanup || (() => {});

    this.handleId = null;
    this.janus = null;
    this.pc = null;
    this.localStream = null;
  }

  handleMessage(message) {
    if (message.janus === 'event') {
      this.onMessage(message.plugindata?.data, message.jsep);
    }
  }

  send(body) {
    return this.janus.sendMessage({
      janus: 'message',
      handle_id: this.handleId,
      body: body
    });
  }

  sendWithJsep(body, jsep) {
    return this.janus.sendMessage({
      janus: 'message',
      handle_id: this.handleId,
      body: body,
      jsep: jsep
    });
  }

  async createOffer(options = {}) {
    if (!this.pc) {
      await this.createPeerConnection();
    }

    if (options.media?.audio) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.localStream.getTracks().forEach(track => {
          this.pc.addTrack(track, this.localStream);
          this.onLocalTrack(track, true);
        });
      } catch (error) {
        console.error('Failed to get user media:', error);
        throw error;
      }
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    return { type: offer.type, sdp: offer.sdp };
  }

  async handleRemoteJsep(jsep) {
    if (!this.pc) {
      await this.createPeerConnection();
    }
    await this.pc.setRemoteDescription(new RTCSessionDescription(jsep));

    if (jsep.type === 'offer') {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      return { type: answer.type, sdp: answer.sdp };
    }
  }

  async createPeerConnection() {
    this.pc = new RTCPeerConnection({
      iceServers: this.janus.iceServers
    });

    this.pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => {
        this.onRemoteTrack(track, event.streams[0], true);
      });
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.janus.sendMessage({
          janus: 'trickle',
          handle_id: this.handleId,
          candidate: event.candidate
        });
      }
    };
  }

  hangup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.onCleanup();
  }

  detach() {
    this.hangup();
    return this.janus.sendMessage({
      janus: 'detach',
      handle_id: this.handleId
    });
  }
}

// Export for use in other scripts
window.Janus = Janus;
window.JanusPlugin = JanusPlugin;
```

**Step 2: Commit**

```bash
git add public/js/janus.js
git commit -m "feat: add minimal Janus client library"
```

---

### Task 7: Implement Room JavaScript

**Files:**
- Create: `public/js/room.js`

**Step 1: Create room logic**

Create `public/js/room.js`:

```javascript
// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('id');

if (!roomId) {
  window.location.href = '/';
}

// DOM elements
const roomTitle = document.getElementById('room-title');
const leaveBtn = document.getElementById('leave-btn');
const participantList = document.getElementById('participant-list');
const sipExtension = document.getElementById('sip-extension');
const callBtn = document.getElementById('call-btn');
const callStatus = document.getElementById('call-status');
const callStatusText = document.getElementById('call-status-text');
const hangupBtn = document.getElementById('hangup-btn');
const muteBtn = document.getElementById('mute-btn');
const passwordDialog = document.getElementById('password-dialog');
const sipPassword = document.getElementById('sip-password');
const cancelPasswordBtn = document.getElementById('cancel-password');

// State
let janus = null;
let audioBridgePlugin = null;
let sipPlugin = null;
let localStream = null;
let isMuted = false;
let currentRoom = null;
let myId = null;
let participants = new Map();

// Configuration
const JANUS_SERVER = 'ws://localhost:8188';  // Update for production

// Initialize
async function init() {
  try {
    // Fetch room info
    const response = await fetch(`/api/rooms/${roomId}`);
    if (!response.ok) {
      throw new Error('Room not found');
    }
    currentRoom = await response.json();
    roomTitle.textContent = `Room: ${currentRoom.name}`;

    // Join room in backend
    await fetch(`/api/rooms/${roomId}/join`, { method: 'POST' });

    // Connect to Janus
    await connectToJanus();

  } catch (error) {
    console.error('Initialization failed:', error);
    showError(error.message);
  }
}

async function connectToJanus() {
  janus = new Janus({
    server: JANUS_SERVER,
    error: (error) => {
      console.error('Janus error:', error);
      showError('Connection error');
    },
    destroyed: () => {
      console.log('Janus session destroyed');
    }
  });

  await janus.connect();
  console.log('Connected to Janus');

  // Attach to AudioBridge
  audioBridgePlugin = new JanusPlugin({
    plugin: 'janus.plugin.audiobridge',
    onmessage: handleAudioBridgeMessage,
    onlocaltrack: (track, on) => {
      console.log('Local track:', track.kind, on);
    },
    onremotetrack: (track, stream, on) => {
      console.log('Remote track:', track.kind, on);
      if (on && track.kind === 'audio') {
        playRemoteAudio(stream);
      }
    }
  });

  await janus.attach(audioBridgePlugin);
  console.log('AudioBridge attached');

  // Join AudioBridge room
  await joinAudioBridge();
}

async function joinAudioBridge() {
  // Create offer with audio
  const jsep = await audioBridgePlugin.createOffer({ media: { audio: true } });

  // Join room (Janus creates room if it doesn't exist)
  const response = await audioBridgePlugin.sendWithJsep({
    request: 'join',
    room: parseInt(roomId, 36),  // Convert string ID to number
    display: 'User-' + Math.random().toString(36).substring(2, 6)
  }, jsep);

  console.log('Joined AudioBridge');
}

function handleAudioBridgeMessage(msg, jsep) {
  console.log('AudioBridge message:', msg);

  if (msg.audiobridge === 'joined') {
    myId = msg.id;
    updateParticipants(msg.participants || []);
  }

  if (msg.audiobridge === 'event') {
    if (msg.participants) {
      updateParticipants(msg.participants);
    }
    if (msg.leaving) {
      participants.delete(msg.leaving);
      renderParticipants();
    }
  }

  if (jsep) {
    audioBridgePlugin.handleRemoteJsep(jsep);
  }
}

function updateParticipants(list) {
  list.forEach(p => {
    participants.set(p.id, p);
  });
  renderParticipants();
}

function renderParticipants() {
  const items = [];
  items.push(`<li>• You${isMuted ? ' (muted)' : ''}</li>`);

  participants.forEach((p, id) => {
    if (id !== myId) {
      items.push(`<li>• ${escapeHtml(p.display || 'Guest')}${p.muted ? ' (muted)' : ''}</li>`);
    }
  });

  participantList.innerHTML = items.join('');
}

function playRemoteAudio(stream) {
  let audio = document.getElementById('remote-audio');
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'remote-audio';
    audio.autoplay = true;
    document.body.appendChild(audio);
  }
  audio.srcObject = stream;
}

// SIP calling
async function initiateSipCall(extension, password) {
  if (!sipPlugin) {
    sipPlugin = new JanusPlugin({
      plugin: 'janus.plugin.sip',
      onmessage: handleSipMessage
    });
    await janus.attach(sipPlugin);
  }

  // Register as a SIP user first, then call
  await sipPlugin.send({
    request: 'register',
    username: `sip:webuser@localhost`,
    secret: password
  });
}

function handleSipMessage(msg, jsep) {
  console.log('SIP message:', msg);

  if (msg.result?.event === 'registered') {
    // Now make the call
    const extension = sipExtension.value.trim();
    sipPlugin.send({
      request: 'call',
      uri: `sip:${extension}@localhost`
    });
    updateCallStatus('Calling...');
  }

  if (msg.result?.event === 'calling') {
    updateCallStatus('Ringing...');
  }

  if (msg.result?.event === 'accepted') {
    updateCallStatus('Connected');
    if (jsep) {
      sipPlugin.handleRemoteJsep(jsep);
    }
  }

  if (msg.result?.event === 'hangup') {
    updateCallStatus('');
    callStatus.classList.add('hidden');
  }

  if (msg.error) {
    updateCallStatus('Error: ' + msg.error);
  }
}

function updateCallStatus(status) {
  if (status) {
    callStatus.classList.remove('hidden');
    callStatusText.textContent = status;
  } else {
    callStatus.classList.add('hidden');
  }
}

function hangupSipCall() {
  if (sipPlugin) {
    sipPlugin.send({ request: 'hangup' });
  }
}

// Mute toggle
function toggleMute() {
  isMuted = !isMuted;

  if (audioBridgePlugin?.localStream) {
    audioBridgePlugin.localStream.getAudioTracks().forEach(track => {
      track.enabled = !isMuted;
    });
  }

  audioBridgePlugin?.send({
    request: 'configure',
    muted: isMuted
  });

  muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
  muteBtn.classList.toggle('muted', isMuted);
  renderParticipants();
}

// Leave room
async function leaveRoom() {
  try {
    await fetch(`/api/rooms/${roomId}/leave`, { method: 'POST' });
  } catch (e) {
    // Ignore errors on leave
  }

  if (audioBridgePlugin) {
    audioBridgePlugin.detach();
  }
  if (sipPlugin) {
    sipPlugin.detach();
  }
  if (janus) {
    janus.destroy();
  }

  window.location.href = '/';
}

function showError(message) {
  const main = document.querySelector('main');
  main.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
leaveBtn.addEventListener('click', leaveRoom);
muteBtn.addEventListener('click', toggleMute);

callBtn.addEventListener('click', () => {
  const extension = sipExtension.value.trim();
  if (!extension) {
    alert('Enter an extension');
    return;
  }
  sipPassword.value = '';
  passwordDialog.showModal();
});

cancelPasswordBtn.addEventListener('click', () => {
  passwordDialog.close();
});

passwordDialog.addEventListener('submit', (e) => {
  e.preventDefault();
  const password = sipPassword.value;
  if (password) {
    initiateSipCall(sipExtension.value.trim(), password);
    passwordDialog.close();
  }
});

hangupBtn.addEventListener('click', hangupSipCall);

// Handle page unload
window.addEventListener('beforeunload', () => {
  navigator.sendBeacon(`/api/rooms/${roomId}/leave`);
});

// Start
init();
```

**Step 2: Commit**

```bash
git add public/js/room.js
git commit -m "feat: add room page JavaScript with Janus integration"
```

---

## Phase 4: Configuration & Polish

### Task 8: Add Configuration File

**Files:**
- Create: `server/config.ts`
- Create: `config.example.json`
- Modify: `server/index.ts`

**Step 1: Create config type and loader**

Create `server/config.ts`:

```typescript
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Config {
  port: number;
  sipPassword: string;
  janusUrl: string;
  janusAdminUrl: string;
  janusAdminSecret: string;
}

const defaultConfig: Config = {
  port: 3000,
  sipPassword: 'changeme',
  janusUrl: 'ws://localhost:8188',
  janusAdminUrl: 'http://localhost:7088/admin',
  janusAdminSecret: 'janusoverlord'
};

export function loadConfig(): Config {
  const configPath = join(__dirname, '../config.json');

  if (!existsSync(configPath)) {
    console.warn('No config.json found, using defaults');
    return defaultConfig;
  }

  try {
    const fileContent = readFileSync(configPath, 'utf-8');
    const fileConfig = JSON.parse(fileContent);
    return { ...defaultConfig, ...fileConfig };
  } catch (error) {
    console.error('Failed to load config.json:', error);
    return defaultConfig;
  }
}

export const config = loadConfig();
```

**Step 2: Create example config file**

Create `config.example.json`:

```json
{
  "port": 3000,
  "sipPassword": "your-shared-secret",
  "janusUrl": "ws://your-server:8188",
  "janusAdminUrl": "http://your-server:7088/admin",
  "janusAdminSecret": "janusoverlord"
}
```

**Step 3: Add config API endpoint**

Add to `server/routes/rooms.ts` at the end before export:

```typescript
// Config endpoint (only exposes safe values)
router.get('/config', (_req, res) => {
  res.json({
    janusUrl: config.janusUrl
  });
});
```

And add import at top:

```typescript
import { config } from '../config.js';
```

**Step 4: Update room.js to fetch config**

Update the JANUS_SERVER initialization in `public/js/room.js`:

Replace:
```javascript
const JANUS_SERVER = 'ws://localhost:8188';  // Update for production
```

With:
```javascript
let JANUS_SERVER = 'ws://localhost:8188';

// Fetch config from server
async function loadConfig() {
  try {
    const response = await fetch('/api/rooms/config');
    const config = await response.json();
    JANUS_SERVER = config.janusUrl;
  } catch (e) {
    console.warn('Failed to load config, using default');
  }
}
```

And call it at the start of init():
```javascript
async function init() {
  await loadConfig();
  // ... rest of init
}
```

**Step 5: Commit**

```bash
git add server/config.ts config.example.json server/routes/rooms.ts public/js/room.js
git commit -m "feat: add configuration file support"
```

---

### Task 9: Add SIP Password Validation

**Files:**
- Create: `server/routes/sip.ts`
- Modify: `server/index.ts`

**Step 1: Create SIP routes**

Create `server/routes/sip.ts`:

```typescript
import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

// Validate SIP password
router.post('/validate', (req, res) => {
  const { password } = req.body;

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Password required' });
    return;
  }

  const valid = password === config.sipPassword;
  res.json({ valid });
});

export default router;
```

**Step 2: Add SIP routes to server**

Update `server/index.ts`, add import:

```typescript
import sipRoutes from './routes/sip.js';
```

And add route:

```typescript
app.use('/api/sip', sipRoutes);
```

**Step 3: Update room.js to validate password**

Update the password dialog submit handler in `public/js/room.js`:

```javascript
passwordDialog.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = sipPassword.value;
  if (!password) return;

  // Validate password first
  try {
    const response = await fetch('/api/sip/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const result = await response.json();

    if (!result.valid) {
      alert('Invalid password');
      return;
    }

    initiateSipCall(sipExtension.value.trim(), password);
    passwordDialog.close();
  } catch (error) {
    alert('Failed to validate password');
  }
});
```

**Step 4: Commit**

```bash
git add server/routes/sip.ts server/index.ts public/js/room.js
git commit -m "feat: add SIP password validation endpoint"
```

---

### Task 10: Add Janus Admin Client for Room Cleanup

**Files:**
- Create: `server/services/janus.ts`
- Modify: `server/services/rooms.ts`

**Step 1: Create Janus admin client**

Create `server/services/janus.ts`:

```typescript
import { config } from '../config.js';

export async function destroyAudioBridgeRoom(roomId: number): Promise<boolean> {
  try {
    const response = await fetch(config.janusAdminUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        janus: 'message_plugin',
        plugin: 'janus.plugin.audiobridge',
        transaction: randomString(12),
        admin_secret: config.janusAdminSecret,
        request: {
          request: 'destroy',
          room: roomId
        }
      })
    });

    const result = await response.json();
    return result.janus === 'success';
  } catch (error) {
    console.error('Failed to destroy Janus room:', error);
    return false;
  }
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
```

**Step 2: Update room cleanup to call Janus**

Update `server/services/rooms.ts`, add import and modify cleanup:

```typescript
import { destroyAudioBridgeRoom } from './janus.js';

export async function cleanupExpiredRooms(): Promise<string[]> {
  const now = Date.now();
  const expiredIds: string[] = [];

  for (const [id, room] of rooms) {
    if (now - room.lastActivity > ROOM_EXPIRY_MS) {
      rooms.delete(id);
      expiredIds.push(id);

      // Also destroy in Janus (convert ID to number)
      const janusRoomId = parseInt(id, 36);
      await destroyAudioBridgeRoom(janusRoomId);
    }
  }

  return expiredIds;
}
```

**Step 3: Update server.ts for async cleanup**

In `server/index.ts`, update the cleanup interval:

```typescript
// Cleanup expired rooms every minute
setInterval(async () => {
  const expired = await cleanupExpiredRooms();
  if (expired.length > 0) {
    console.log(`Cleaned up ${expired.length} expired room(s)`);
  }
}, 60 * 1000);
```

**Step 4: Commit**

```bash
git add server/services/janus.ts server/services/rooms.ts server/index.ts
git commit -m "feat: add Janus admin client for room cleanup"
```

---

## Phase 5: Documentation

### Task 11: Create README

**Files:**
- Create: `README.md`

**Step 1: Write README**

Create `README.md`:

```markdown
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
apt install janus janus-plugins
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
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
```

---

## Summary

**Total Tasks:** 11

**Phase 1 - Setup:** Tasks 1-2 (project init, landing page)
**Phase 2 - API:** Tasks 3-4 (room service, routes)
**Phase 3 - Room Page:** Tasks 5-7 (room HTML, Janus client, room JS)
**Phase 4 - Polish:** Tasks 8-10 (config, SIP validation, Janus cleanup)
**Phase 5 - Docs:** Task 11 (README)

Each task builds on the previous, with frequent commits for easy rollback.
