import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import roomRoutes from './routes/rooms.js';
import sipRoutes from './routes/sip.js';
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
app.use('/api/sip', sipRoutes);

// Cleanup expired rooms every minute
setInterval(async () => {
  const expired = await cleanupExpiredRooms();
  if (expired.length > 0) {
    console.log(`Cleaned up ${expired.length} expired room(s)`);
  }
}, 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
