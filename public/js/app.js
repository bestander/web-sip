const roomList = document.getElementById('room-list');
const createRoomBtn = document.getElementById('create-room-btn');
const createRoomDialog = document.getElementById('create-room-dialog');
const cancelCreateBtn = document.getElementById('cancel-create');
const roomNameInput = document.getElementById('room-name');

async function fetchRooms() {
  try {
    const response = await fetch('/api/rooms');
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
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
          : `<button class="join-room-btn" data-room-id="${escapeHtml(room.id)}">Join</button>`
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
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
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

// Event delegation for join room buttons
roomList.addEventListener('click', (e) => {
  const joinBtn = e.target.closest('.join-room-btn');
  if (joinBtn) {
    const roomId = joinBtn.dataset.roomId;
    if (roomId) {
      joinRoom(roomId);
    }
  }
});

// Initial load and polling
fetchRooms();
setInterval(fetchRooms, 5000);
