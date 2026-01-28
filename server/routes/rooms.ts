import { Router } from 'express';
import * as roomService from '../services/rooms.js';
import { config } from '../config.js';

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

// Config endpoint (only exposes safe values)
// Must be before /:id route to avoid matching "config" as an ID
router.get('/config', (req, res) => {
  // Use the request's host to construct the WebSocket URL
  // This ensures it works regardless of domain (localhost, IP, or domain name)
  const protocol = req.protocol === 'https' ? 'wss:' : 'ws:';
  const host = req.get('host') || 'localhost';
  
  // If config has a custom janusUrl that's not localhost, use it
  // Otherwise, construct from current request
  let janusUrl = config.janusUrl;
  
  // If the config URL contains localhost or 127.0.0.1, replace with current host
  if (janusUrl.includes('localhost') || janusUrl.includes('127.0.0.1')) {
    // Extract path from config (e.g., /janus) or default to /janus
    const urlMatch = janusUrl.match(/:\/\/[^\/]+(\/.*)?$/);
    const path = urlMatch && urlMatch[1] ? urlMatch[1] : '/janus';
    janusUrl = `${protocol}//${host}${path}`;
  }
  
  res.json({
    janusUrl
  });
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
router.post('/:id/join', async (req, res) => {
  try {
    const room = await roomService.joinRoom(req.params.id);

    if (!room) {
      res.status(400).json({ error: 'Cannot join room (not found or full)' });
      return;
    }

    res.json(room);
  } catch (error: any) {
    console.error('Error in join room endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to join room', 
      details: error.message 
    });
  }
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
