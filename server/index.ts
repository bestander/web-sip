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
    diagnostics.janus.adminApi.errorCode = error.code;
    diagnostics.janus.adminApi.reachable = false;
    
    // Provide helpful error messages
    if (error.message.includes('ECONNREFUSED') || error.code === 'ECONNREFUSED') {
      diagnostics.janus.adminApi.suggestion = 'Janus admin API is not running or not accessible. Check: 1) Is Janus running? (systemctl status janus) 2) Is admin API enabled in Janus config? 3) Is port 7088 open?';
      diagnostics.janus.adminApi.fixSteps = [
        'Check Janus status: systemctl status janus',
        'Check if admin API is enabled in /etc/janus/janus.jcfg (admin_http = true)',
        'Check if admin port is configured: grep -r "admin_http" /etc/janus/',
        'Check if port 7088 is listening: netstat -tulpn | grep 7088'
      ];
    } else if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
      diagnostics.janus.adminApi.suggestion = 'Janus admin API not responding. Check if port 7088 is open and Janus is configured.';
      diagnostics.janus.adminApi.fixSteps = [
        'Check if Janus is running: systemctl status janus',
        'Check Janus logs: journalctl -u janus -n 50',
        'Verify admin API port in Janus config'
      ];
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo') || error.code === 'ENOTFOUND') {
      diagnostics.janus.adminApi.suggestion = 'Cannot resolve hostname. Check config.json janusAdminUrl.';
      diagnostics.janus.adminApi.fixSteps = [
        'Verify janusAdminUrl in config.json is correct',
        'If using localhost, ensure it resolves correctly'
      ];
    } else {
      diagnostics.janus.adminApi.suggestion = 'Unknown error connecting to Janus admin API. Check error details above.';
      diagnostics.janus.adminApi.fixSteps = [
        'Check Janus is running: systemctl status janus',
        'Check Janus logs: journalctl -u janus -n 50',
        'Verify admin API is enabled in Janus configuration',
        'Test admin API manually: curl -X POST http://localhost:7088/admin -d \'{"janus":"info"}\''
      ];
    }
  }

  res.json(diagnostics);
});

// Test Janus room creation endpoint - exposes full request/response for debugging
app.post('/api/test-janus-room', async (req, res) => {
  const { config } = await import('./config.js');
  const { createAudioBridgeRoom } = await import('./services/janus.js');
  
  const testRoomId = req.body.roomId || 999999;
  
  const result: any = {
    timestamp: new Date().toISOString(),
    testRoomId,
    config: {
      janusAdminUrl: config.janusAdminUrl,
      janusAdminSecret: config.janusAdminSecret ? '***configured***' : 'missing'
    },
    request: null,
    response: null,
    success: false,
    error: null
  };

  try {
    // Manually test the room creation to capture full details
    const transaction = Math.random().toString(36).substring(2, 14);
    const requestBody = {
      janus: 'message_plugin',
      plugin: 'janus.plugin.audiobridge',
      transaction: transaction,
      admin_secret: config.janusAdminSecret,
      request: {
        request: 'create',
        room: testRoomId,
        description: `Test Room ${testRoomId}`,
        record: false,
        is_private: false
      }
    };
    
    result.request = requestBody;
    
    console.log(`[TEST] Creating test room ${testRoomId} via ${config.janusAdminUrl}`);
    console.log(`[TEST] Request:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(config.janusAdminUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    result.response = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    };

    if (!response.ok) {
      const text = await response.text();
      result.response.body = text;
      result.error = `HTTP ${response.status}: ${response.statusText}`;
      console.error(`[TEST] Failed: ${result.error}`);
      console.error(`[TEST] Response body:`, text);
    } else {
      const json = await response.json();
      result.response.body = json;
      result.success = json.janus === 'success' || json.plugindata?.data?.error_code === 427;
      console.log(`[TEST] Response:`, JSON.stringify(json, null, 2));
      console.log(`[TEST] Success:`, result.success);
    }
  } catch (error: any) {
    result.error = error.message;
    result.errorStack = error.stack;
    console.error(`[TEST] Exception:`, error);
  }

  res.json(result);
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
