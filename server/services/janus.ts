import { config } from '../config.js';

export async function createAudioBridgeRoom(roomId: number): Promise<boolean> {
  const timestamp = new Date().toISOString();
  try {
    console.log(`[${timestamp}] ===== Creating Janus AudioBridge room ${roomId} =====`);
    console.log(`[${timestamp}] Admin URL: ${config.janusAdminUrl}`);
    console.log(`[${timestamp}] Admin secret configured: ${config.janusAdminSecret ? 'YES' : 'NO'}`);
    
    const transaction = randomString(12);
    const requestBody = {
      janus: 'message_plugin',
      plugin: 'janus.plugin.audiobridge',
      transaction: transaction,
      admin_secret: config.janusAdminSecret,
      request: {
        request: 'create',
        room: roomId,
        description: `Room ${roomId}`,
        record: false,
        is_private: false
      }
    };
    
    console.log(`[${timestamp}] Request body:`, JSON.stringify(requestBody, null, 2));
    console.log(`[${timestamp}] Making POST request to ${config.janusAdminUrl}...`);
    
    const response = await fetch(config.janusAdminUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    console.log(`[${timestamp}] Response status: ${response.status} ${response.statusText}`);
    console.log(`[${timestamp}] Response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const text = await response.text();
      console.error(`[${timestamp}] ❌ HTTP Error ${response.status}: ${response.statusText}`);
      console.error(`[${timestamp}] Response body:`, text);
      return false;
    }

    const result = await response.json();
    console.log(`[${timestamp}] Response JSON:`, JSON.stringify(result, null, 2));
    
    // Success if janus is 'success' or if error is that room already exists
    if (result.janus === 'success') {
      console.log(`[${timestamp}] ✅ Successfully created Janus room ${roomId}`);
      return true;
    }
    if (result.error_code === 427) {
      // Room already exists, that's fine
      console.log(`[${timestamp}] ✅ Janus room ${roomId} already exists (error_code 427)`);
      return true;
    }
    // Check if it's a plugin error that says room already exists
    if (result.plugindata?.data?.error_code === 427) {
      console.log(`[${timestamp}] ✅ Janus room ${roomId} already exists (from plugin data)`);
      return true;
    }
    console.error(`[${timestamp}] ❌ Failed to create Janus room. Full response:`, JSON.stringify(result, null, 2));
    return false;
  } catch (error: any) {
    console.error(`[${timestamp}] ❌ Exception creating Janus room:`, error.message || error);
    console.error(`[${timestamp}] Error stack:`, error.stack);
    if (error.cause) {
      console.error(`[${timestamp}] Error cause:`, error.cause);
    }
    if (error.code) {
      console.error(`[${timestamp}] Error code:`, error.code);
    }
    return false;
  }
}

export async function destroyAudioBridgeRoom(roomId: number): Promise<boolean> {
  try {
    const response = await fetch(config.janusAdminUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        janus: 'message_plugin',
        plugin: 'janus.plugin.audiobridge',
        transaction: randomString(12),
        admin_secret: config.janusAdminSecret,
        request: {
          request: 'destroy',
          room: roomId
        }
      })
    });

    const result = await response.json();
    return result.janus === 'success';
  } catch (error) {
    console.error('Failed to destroy Janus room:', error);
    return false;
  }
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
