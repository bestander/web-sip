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

// Trust proxy (for correct protocol detection behind nginx)
app.set('trust proxy', true);

app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Diagnostic endpoint to check Janus connectivity
app.get('/api/diagnostics', async (_req, res) => {
  const { config } = await import('./config.js');
  
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    server: {
      nodeVersion: process.version,
      uptime: process.uptime()
    },
    config: {
      janusUrl: config.janusUrl,
      janusAdminUrl: config.janusAdminUrl,
      // Don't expose secret
      janusAdminSecret: config.janusAdminSecret ? '***configured***' : 'missing'
    }
  };

  // Check if we can reach Janus admin API
  diagnostics.janus = {
    adminApi: {
      url: config.janusAdminUrl,
      reachable: false,
      error: null,
      status: null,
      statusText: null
    },
    websocket: {
      url: config.janusUrl,
      note: 'WebSocket connectivity must be tested from browser'
    }
  };

  try {
    const adminResponse = await fetch(config.janusAdminUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ janus: 'info' }),
      // Add timeout
      signal: AbortSignal.timeout(5000)
    });
    
    diagnostics.janus.adminApi.reachable = adminResponse.ok;
    diagnostics.janus.adminApi.status = adminResponse.status;
    diagnostics.janus.adminApi.statusText = adminResponse.statusText;
    
    if (adminResponse.ok) {
      try {
        const data = await adminResponse.json();
        diagnostics.janus.adminApi.response = {
          janus: data.janus,
          version_string: data.version_string
        };
      } catch (e) {
        // Response not JSON, that's ok
      }
    }
  } catch (error: any) {
    diagnostics.janus.adminApi.error = error.message;
    diagnostics.janus.adminApi.reachable = false;
    
    // Provide helpful error messages
    if (error.message.includes('ECONNREFUSED')) {
      diagnostics.janus.adminApi.suggestion = 'Janus may not be running. Check with: systemctl status janus';
    } else if (error.message.includes('timeout')) {
      diagnostics.janus.adminApi.suggestion = 'Janus admin API not responding. Check if port 7088 is open and Janus is configured.';
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      diagnostics.janus.adminApi.suggestion = 'Cannot resolve hostname. Check config.json janusAdminUrl.';
    }
  }

  res.json(diagnostics);
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
