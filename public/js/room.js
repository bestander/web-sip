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
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const config = await response.json();
    if (config.janusUrl) {
      JANUS_SERVER = config.janusUrl;
    }
  } catch (e) {
    console.warn('Failed to load config, using default:', e);
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

    // Join room in backend (this creates the room in Janus if first participant)
    console.log('Joining room in backend...');
    const joinResponse = await fetch(`/api/rooms/${roomId}/join`, { method: 'POST' });
    if (!joinResponse.ok) {
      const error = await joinResponse.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Failed to join room: ${error.error || joinResponse.statusText}`);
    }
    const updatedRoom = await joinResponse.json();
    console.log('Backend join successful, room now has', updatedRoom.participants, 'participant(s)');
    
    // Small delay to ensure Janus room creation completes
    if (updatedRoom.participants === 1) {
      console.log('First participant - waiting a moment for Janus room creation...');
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Connect to Janus
    await connectToJanus();

  } catch (error) {
    console.error('Initialization failed:', error);
    showError(error.message);
  }
}

async function connectToJanus() {
  console.log('Connecting to Janus at:', JANUS_SERVER);
  janus = new Janus({
    server: JANUS_SERVER,
    error: (error) => {
      console.error('Janus error:', error);
      showError('Connection error: ' + (error.message || 'Failed to connect to Janus server'));
    },
    destroyed: () => {
      console.log('Janus session destroyed');
    }
  });

  try {
    await janus.connect();
    console.log('Connected to Janus');
  } catch (error) {
    console.error('Failed to connect to Janus:', error);
    throw error;
  }

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
  try {
    // Create offer with audio
    const jsep = await audioBridgePlugin.createOffer({ media: { audio: true } });

    // Join room - try to create if it's the first participant (fallback if server creation failed)
    const janusRoomId = parseInt(roomId, 36);
    const isFirstParticipant = currentRoom.participants === 0;
    const response = await audioBridgePlugin.sendWithJsep({
      request: 'join',
      room: janusRoomId,
      display: 'User-' + Math.random().toString(36).substring(2, 6),
      // Try to create room if first participant (may require admin, but worth trying)
      ...(isFirstParticipant ? { create: true } : {})
    }, jsep);

    console.log('Join response:', response);

    // Handle JSEP answer from Janus (this completes the WebRTC negotiation)
    // Note: JSEP might come in the ack response or in the async event
    if (response.jsep) {
      console.log('Received JSEP answer in response, completing WebRTC negotiation');
      await audioBridgePlugin.handleRemoteJsep(response.jsep);
    }

    // Check if join was successful in the immediate response
    const pluginData = response?.plugindata?.data;
    console.log('Plugin data in response:', pluginData);
    
    if (pluginData?.audiobridge === 'joined') {
      console.log('Joined AudioBridge successfully (immediate response)');
      myId = pluginData.id;
      if (pluginData.participants) {
        updateParticipants(pluginData.participants);
      }
    } else if (pluginData?.error_code || pluginData?.error) {
      throw new Error(pluginData.error || `Join failed with error code ${pluginData.error_code}`);
    } else {
      // Janus sent an 'ack', the actual join confirmation will come as an async event
      console.log('Received ack, waiting for join confirmation event...');
    }
  } catch (error) {
    console.error('Failed to join AudioBridge:', error);
    let errorMessage = 'Failed to access microphone. ';
    
    if (error.message && error.message.includes('getUserMedia is not available')) {
      if (window.location.protocol === 'http:') {
        errorMessage += 'This application requires HTTPS to access your microphone. ';
        errorMessage += 'Please contact the administrator to set up SSL certificates.';
      } else {
        errorMessage += error.message;
      }
    } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      errorMessage += 'Microphone permission was denied. Please allow microphone access and refresh the page.';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      errorMessage += 'No microphone found. Please connect a microphone and try again.';
    } else {
      errorMessage += error.message || 'Unknown error occurred.';
    }
    
    showError(errorMessage);
    throw error;
  }
}

function handleAudioBridgeMessage(msg, jsep) {
  // Check for errors first
  if (msg.error_code || msg.error) {
    const isNoSuchRoomError = msg.error_code === 485 && msg.error?.includes('No such room');
    if (isNoSuchRoomError) {
      // This is a critical error - the room doesn't exist in Janus
      console.error('CRITICAL: Room does not exist in Janus:', msg.error);
      console.error('This means the server-side room creation failed. Check server logs.');
      showError('Failed to join room: Room not found in Janus. Please try again or contact support.');
      return;
    }
    console.error('AudioBridge error:', msg);
    // Don't process error messages further
    return;
  }

  console.log('AudioBridge message:', msg, 'JSEP:', jsep);

  if (msg.audiobridge === 'joined') {
    console.log('Join confirmed via event, participant ID:', msg.id);
    myId = msg.id;
    updateParticipants(msg.participants || []);
  }

  if (msg.audiobridge === 'event') {
    if (msg.participants) {
      console.log('Participant list updated:', msg.participants);
      updateParticipants(msg.participants);
    }
    if (msg.leaving) {
      console.log('Participant leaving:', msg.leaving);
      participants.delete(msg.leaving);
      renderParticipants();
    }
  }

  if (jsep) {
    console.log('Handling JSEP from event');
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
  console.log('Playing remote audio stream:', stream);
  let audio = document.getElementById('remote-audio');
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'remote-audio';
    audio.autoplay = true;
    audio.playsInline = true;
    document.body.appendChild(audio);
  }
  audio.srcObject = stream;
  
  // Ensure audio plays
  audio.play().catch(err => {
    console.error('Failed to play remote audio:', err);
  });
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
