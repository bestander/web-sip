import { Room } from '../types.js';
import { destroyAudioBridgeRoom } from './janus.js';

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
