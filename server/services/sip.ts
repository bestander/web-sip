import dgram from 'dgram';
import { config } from '../config.js';

// SIP registration storage: username -> contact URI and expiry
const registrations = new Map<string, { contact: string; expires: number }>();

// SIP server socket
let sipServer: dgram.Socket | null = null;

// Parse SIP message
function parseSipMessage(msg: string): {
  method?: string;
  statusCode?: number;
  statusText?: string;
  headers: Record<string, string>;
  body: string;
} {
  const lines = msg.split('\r\n');
  const firstLine = lines[0];
  const headers: Record<string, string> = {};
  let bodyStart = -1;

  // Parse first line (request or response)
  const isRequest = !firstLine.startsWith('SIP/2.0');
  const method = isRequest ? firstLine.split(' ')[0] : undefined;
  const statusCode = !isRequest ? parseInt(firstLine.split(' ')[1]) : undefined;
  const statusText = !isRequest ? firstLine.split(' ').slice(2).join(' ') : undefined;

  // Parse headers
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') {
      bodyStart = i + 1;
      break;
    }
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }

  // Parse body
  const body = bodyStart > 0 ? lines.slice(bodyStart).join('\r\n') : '';

  return { method, statusCode, statusText, headers, body };
}

// Extract username from SIP URI
function extractUsername(uri: string): string {
  const match = uri.match(/sip:([^@]+)@/);
  return match ? match[1] : '';
}

// Validate SIP Digest authentication (simplified)
function validateAuth(authHeader: string, username: string, password: string, method: string, uri: string): boolean {
  // Simplified: check if password matches
  // In production, implement proper Digest authentication with MD5 hash validation
  const realmMatch = authHeader.match(/realm="([^"]+)"/);
  const usernameMatch = authHeader.match(/username="([^"]+)"/);
  
  if (!realmMatch || !usernameMatch) return false;
  if (usernameMatch[1] !== username) return false;
  
  // For now, just check password is provided
  // Full Digest auth would require MD5 hash validation
  return password === config.sipPassword;
}

// Handle REGISTER request
function handleRegister(msg: string, rinfo: dgram.RemoteInfo): string {
  const parsed = parseSipMessage(msg);
  const from = parsed.headers.from || '';
  const to = parsed.headers.to || '';
  const contact = parsed.headers.contact || '';
  const expires = parseInt(parsed.headers.expires || '3600');
  const authHeader = parsed.headers.authorization || '';

  const username = extractUsername(from);
  if (!username) {
    return 'SIP/2.0 400 Bad Request\r\n\r\n';
  }

  // Validate authentication
  const uri = from.match(/<([^>]+)>/) || from.match(/(sip:[^>]+)/);
  const sipUri = uri ? uri[1] : '';
  if (!validateAuth(authHeader, username, config.sipPassword, 'REGISTER', sipUri)) {
    return 'SIP/2.0 401 Unauthorized\r\n' +
           'WWW-Authenticate: Digest realm="server", nonce="' + Date.now() + '"\r\n\r\n';
  }

  // Extract contact URI
  const contactMatch = contact.match(/<([^>]+)>/) || contact.match(/(sip:[^;]+)/);
  const contactUri = contactMatch ? contactMatch[1] : `sip:${username}@${rinfo.address}:${rinfo.port}`;

  // Store registration
  registrations.set(username, {
    contact: contactUri,
    expires: Date.now() + expires * 1000
  });

  // Send 200 OK
  const toTag = to.includes('tag=') ? to : `${to};tag=${Date.now()}`;
  const response = `SIP/2.0 200 OK\r\n` +
    `Via: ${parsed.headers.via}\r\n` +
    `From: ${from}\r\n` +
    `To: ${toTag}\r\n` +
    `Call-ID: ${parsed.headers['call-id']}\r\n` +
    `CSeq: ${parsed.headers.cseq}\r\n` +
    `Contact: <${contactUri}>;expires=${expires}\r\n` +
    `Content-Length: 0\r\n\r\n`;

  console.log(`[SIP] Registered: ${username} -> ${contactUri} (expires: ${expires}s)`);
  return response;
}

// Handle INVITE request
function handleInvite(msg: string, rinfo: dgram.RemoteInfo): string {
  const parsed = parseSipMessage(msg);
  const to = parsed.headers.to || '';
  const from = parsed.headers.from || '';
  const callId = parsed.headers['call-id'] || '';

  const targetUsername = extractUsername(to);
  if (!targetUsername) {
    return 'SIP/2.0 400 Bad Request\r\n\r\n';
  }

  // Look up registration
  const registration = registrations.get(targetUsername);
  if (!registration || registration.expires < Date.now()) {
    console.log(`[SIP] INVITE failed: ${targetUsername} not registered or expired`);
    return 'SIP/2.0 404 Not Found\r\n\r\n';
  }

  // Route INVITE to registered contact
  // In a full implementation, we'd forward this to the registered device
  // For now, we'll send a 100 Trying and let Janus handle the actual routing
  const response = `SIP/2.0 100 Trying\r\n` +
    `Via: ${parsed.headers.via}\r\n` +
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Call-ID: ${callId}\r\n` +
    `CSeq: ${parsed.headers.cseq}\r\n` +
    `Content-Length: 0\r\n\r\n`;

  console.log(`[SIP] INVITE: ${extractUsername(from)} -> ${targetUsername} (${registration.contact})`);
  
  // TODO: Forward INVITE to registered contact
  // This requires parsing the contact URI and sending UDP packet to that address
  
  return response;
}

// Handle BYE request
function handleBye(msg: string, rinfo: dgram.RemoteInfo): string {
  const parsed = parseSipMessage(msg);
  const response = `SIP/2.0 200 OK\r\n` +
    `Via: ${parsed.headers.via}\r\n` +
    `From: ${parsed.headers.from}\r\n` +
    `To: ${parsed.headers.to}\r\n` +
    `Call-ID: ${parsed.headers['call-id']}\r\n` +
    `CSeq: ${parsed.headers.cseq}\r\n` +
    `Content-Length: 0\r\n\r\n`;
  return response;
}

// Start SIP server
export function startSipServer(port: number = 5060): void {
  if (sipServer) {
    console.log('[SIP] Server already running');
    return;
  }

  sipServer = dgram.createSocket('udp4');

  sipServer.on('message', (msg, rinfo) => {
    const message = msg.toString();
    const parsed = parseSipMessage(message);

    let response: string;

    if (parsed.method === 'REGISTER') {
      response = handleRegister(message, rinfo);
    } else if (parsed.method === 'INVITE') {
      response = handleInvite(message, rinfo);
    } else if (parsed.method === 'BYE') {
      response = handleBye(message, rinfo);
    } else if (parsed.method === 'ACK') {
      // ACK doesn't require response
      return;
    } else {
      response = 'SIP/2.0 501 Not Implemented\r\n\r\n';
    }

    if (response && sipServer) {
      sipServer.send(response, rinfo.port, rinfo.address, (err) => {
        if (err) {
          console.error('[SIP] Error sending response:', err);
        }
      });
    }
  });

  sipServer.on('error', (err) => {
    console.error('[SIP] Server error:', err);
  });

  sipServer.bind(port, () => {
    console.log(`[SIP] Server listening on UDP port ${port}`);
  });
}

// Stop SIP server
export function stopSipServer(): void {
  if (sipServer) {
    sipServer.close();
    sipServer = null;
    console.log('[SIP] Server stopped');
  }
}

// Get registration for username
export function getRegistration(username: string): { contact: string; expires: number } | undefined {
  const reg = registrations.get(username);
  if (reg && reg.expires > Date.now()) {
    return reg;
  }
  return undefined;
}

