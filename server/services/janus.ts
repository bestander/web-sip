import { config } from '../config.js';

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
