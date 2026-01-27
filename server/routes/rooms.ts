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
