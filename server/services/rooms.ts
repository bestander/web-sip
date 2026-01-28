import { Room } from '../types.js';
import { createAudioBridgeRoom, destroyAudioBridgeRoom } from './janus.js';

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

export async function joinRoom(id: string): Promise<Room | undefined> {
  const room = rooms.get(id);
  if (!room || room.participants >= 2) {
    return undefined;
  }
  
  // Create room in Janus if this is the first participant
  // If creation fails, we'll still try to join (room might exist from another process)
  if (room.participants === 0) {
    const janusRoomId = parseInt(id, 36);
    console.log(`First participant joining room ${id} (Janus room ${janusRoomId}), creating room in Janus...`);
    const created = await createAudioBridgeRoom(janusRoomId);
    if (!created) {
      console.warn(`Failed to create Janus room ${janusRoomId}, but continuing with join attempt`);
    } else {
      console.log(`Successfully prepared Janus room ${janusRoomId} for joining`);
    }
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

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}
