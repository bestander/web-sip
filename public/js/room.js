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

// Initialize
async function init() {
  await loadConfig();

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

hangupBtn.addEventListener('click', hangupSipCall);

// Handle page unload
window.addEventListener('beforeunload', () => {
  navigator.sendBeacon(`/api/rooms/${roomId}/leave`);
});

// Start
init();
