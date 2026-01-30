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
      
      // Also map short form headers to full names
      const shortFormMap: Record<string, string> = {
        'v': 'via',
        'f': 'from',
        't': 'to',
        'i': 'call-id',
        'c': 'cseq',
        'm': 'contact',
        'l': 'content-length',
        'e': 'content-encoding',
        'o': 'event'
      };
      if (shortFormMap[key]) {
        headers[shortFormMap[key]] = value;
      }
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
  console.log(`[SIP AUTH] Validating auth header: ${authHeader}`);
  
  const realmMatch = authHeader.match(/realm="([^"]+)"/);
  const usernameMatch = authHeader.match(/username="([^"]+)"/);
  const nonceMatch = authHeader.match(/nonce="([^"]+)"/);
  const responseMatch = authHeader.match(/response="([^"]+)"/);
  
  console.log(`[SIP AUTH] Realm: ${realmMatch ? realmMatch[1] : 'not found'}`);
  console.log(`[SIP AUTH] Username in header: ${usernameMatch ? usernameMatch[1] : 'not found'}`);
  console.log(`[SIP AUTH] Expected username: ${username}`);
  console.log(`[SIP AUTH] Nonce: ${nonceMatch ? nonceMatch[1] : 'not found'}`);
  console.log(`[SIP AUTH] Response hash: ${responseMatch ? responseMatch[1] : 'not found'}`);
  
  if (!realmMatch || !usernameMatch) {
    console.error(`[SIP AUTH] Missing realm or username in auth header`);
    return false;
  }
  
  if (usernameMatch[1] !== username) {
    console.error(`[SIP AUTH] Username mismatch: ${usernameMatch[1]} != ${username}`);
    return false;
  }
  
  // For now, just check password is provided
  // Full Digest auth would require MD5 hash validation
  // TODO: Implement proper Digest authentication
  const isValid = password === config.sipPassword;
  console.log(`[SIP AUTH] Password check: ${isValid ? 'PASS' : 'FAIL'}`);
  
  return isValid;
}

// Handle REGISTER request
function handleRegister(msg: string, rinfo: dgram.RemoteInfo): string {
  // Log incoming message
  console.log(`[SIP REGISTER] Received from ${rinfo.address}:${rinfo.port}`);
  console.log(`[SIP REGISTER] Message:\n${msg}`);
  
  const parsed = parseSipMessage(msg);
  const from = parsed.headers.from || '';
  const to = parsed.headers.to || '';
  const contact = parsed.headers.contact || '';
  const expires = parseInt(parsed.headers.expires || '3600');
  const authHeader = parsed.headers.authorization || '';

  console.log(`[SIP REGISTER] From: ${from}`);
  console.log(`[SIP REGISTER] To: ${to}`);
  console.log(`[SIP REGISTER] Contact: ${contact}`);
  console.log(`[SIP REGISTER] Expires: ${expires}`);
  console.log(`[SIP REGISTER] Authorization: ${authHeader ? 'present' : 'missing'}`);

  const username = extractUsername(from);
  if (!username) {
    console.error(`[SIP REGISTER] Error: Could not extract username from From header: ${from}`);
    return 'SIP/2.0 400 Bad Request\r\n\r\n';
  }

  console.log(`[SIP REGISTER] Extracted username: ${username}`);

  // Validate authentication
  const uri = from.match(/<([^>]+)>/) || from.match(/(sip:[^>]+)/);
  const sipUri = uri ? uri[1] : '';
  
  // Handle challenge-response flow
  if (!authHeader) {
    console.log(`[SIP REGISTER] No auth header, sending 401 challenge`);
    const nonce = Date.now().toString(36) + Math.random().toString(36).substring(2);
    return 'SIP/2.0 401 Unauthorized\r\n' +
           `Via: ${parsed.headers.via}\r\n` +
           `From: ${from}\r\n` +
           `To: ${to}\r\n` +
           `Call-ID: ${parsed.headers['call-id']}\r\n` +
           `CSeq: ${parsed.headers.cseq}\r\n` +
           `WWW-Authenticate: Digest realm="server", nonce="${nonce}", algorithm=MD5\r\n` +
           `Content-Length: 0\r\n\r\n`;
  }

  console.log(`[SIP REGISTER] Validating auth for username: ${username}`);
  console.log(`[SIP REGISTER] Expected password: ${config.sipPassword}`);
  
  if (!validateAuth(authHeader, username, config.sipPassword, 'REGISTER', sipUri)) {
    console.error(`[SIP REGISTER] Authentication failed for username: ${username}`);
    console.error(`[SIP REGISTER] Auth header: ${authHeader}`);
    const nonce = Date.now().toString(36) + Math.random().toString(36).substring(2);
    return 'SIP/2.0 401 Unauthorized\r\n' +
           `Via: ${parsed.headers.via}\r\n` +
           `From: ${from}\r\n` +
           `To: ${to}\r\n` +
           `Call-ID: ${parsed.headers['call-id']}\r\n` +
           `CSeq: ${parsed.headers.cseq}\r\n` +
           `WWW-Authenticate: Digest realm="server", nonce="${nonce}", algorithm=MD5\r\n` +
           `Content-Length: 0\r\n\r\n`;
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

// Parse contact URI to get address and port
function parseContactUri(contactUri: string): { address: string; port: number } | null {
  // Parse sip:user@host:port or sip:user@host
  const match = contactUri.match(/sip:[^@]+@([^:;]+):?(\d+)?/);
  if (!match) return null;
  
  const address = match[1];
  const port = match[2] ? parseInt(match[2]) : 5060;
  return { address, port };
}

// Forward SIP message to a contact
function forwardMessage(msg: string, contactUri: string, originalRinfo: dgram.RemoteInfo): void {
  const contact = parseContactUri(contactUri);
  if (!contact || !sipServer) {
    console.error(`[SIP] Cannot forward: invalid contact URI: ${contactUri}`);
    return;
  }

  console.log(`[SIP] Forwarding message to ${contact.address}:${contact.port}`);
  
  sipServer.send(msg, contact.port, contact.address, (err) => {
    if (err) {
      console.error(`[SIP] Error forwarding to ${contact.address}:${contact.port}:`, err);
    } else {
      console.log(`[SIP] Message forwarded successfully to ${contact.address}:${contact.port}`);
    }
  });
}

// Handle INVITE request
function handleInvite(msg: string, rinfo: dgram.RemoteInfo): string {
  console.log(`[SIP INVITE] Received from ${rinfo.address}:${rinfo.port}`);
  console.log(`[SIP INVITE] Message:\n${msg}`);
  
  const parsed = parseSipMessage(msg);
  const to = parsed.headers.to || '';
  const from = parsed.headers.from || '';
  const callId = parsed.headers['call-id'] || '';

  console.log(`[SIP INVITE] From: ${from}`);
  console.log(`[SIP INVITE] To: ${to}`);

  const targetUsername = extractUsername(to);
  if (!targetUsername) {
    console.error(`[SIP INVITE] Error: Could not extract username from To header: ${to}`);
    return 'SIP/2.0 400 Bad Request\r\n\r\n';
  }

  console.log(`[SIP INVITE] Target username: ${targetUsername}`);

  // Look up registration
  const registration = registrations.get(targetUsername);
  if (!registration || registration.expires < Date.now()) {
    console.log(`[SIP INVITE] Failed: ${targetUsername} not registered or expired`);
    console.log(`[SIP INVITE] Available registrations: ${Array.from(registrations.keys()).join(', ')}`);
    return 'SIP/2.0 404 Not Found\r\n\r\n';
  }

  console.log(`[SIP INVITE] Found registration: ${targetUsername} -> ${registration.contact}`);

  // Send 100 Trying immediately
  const tryingResponse = `SIP/2.0 100 Trying\r\n` +
    `Via: ${parsed.headers.via}\r\n` +
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Call-ID: ${callId}\r\n` +
    `CSeq: ${parsed.headers.cseq}\r\n` +
    `Content-Length: 0\r\n\r\n`;

  // Forward INVITE to registered contact
  forwardMessage(msg, registration.contact, rinfo);
  
  console.log(`[SIP INVITE] Forwarded: ${extractUsername(from)} -> ${targetUsername} (${registration.contact})`);
  
  return tryingResponse;
}

// Handle OPTIONS request (capability discovery)
function handleOptions(msg: string, rinfo: dgram.RemoteInfo): string {
  console.log(`[SIP OPTIONS] Received from ${rinfo.address}:${rinfo.port}`);
  
  const parsed = parseSipMessage(msg);
  
  // Headers are now normalized to full names by parseSipMessage
  const via = parsed.headers.via || '';
  const from = parsed.headers.from || '';
  const to = parsed.headers.to || '';
  const callId = parsed.headers['call-id'] || '';
  const cseq = parsed.headers.cseq || '';
  
  if (!via || !from || !to || !callId || !cseq) {
    console.error(`[SIP OPTIONS] Missing required headers! Via: ${via}, From: ${from}, To: ${to}, Call-ID: ${callId}, CSeq: ${cseq}`);
    console.error(`[SIP OPTIONS] Available headers:`, Object.keys(parsed.headers));
  }
  
  // Respond with capabilities
  const response = `SIP/2.0 200 OK\r\n` +
    `Via: ${via}\r\n` +
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Call-ID: ${callId}\r\n` +
    `CSeq: ${cseq}\r\n` +
    `Allow: INVITE, ACK, BYE, CANCEL, OPTIONS, REGISTER\r\n` +
    `Accept: application/sdp\r\n` +
    `Content-Length: 0\r\n\r\n`;
  
  return response;
}

// Handle BYE request
function handleBye(msg: string, rinfo: dgram.RemoteInfo): string {
  console.log(`[SIP BYE] Received from ${rinfo.address}:${rinfo.port}`);
  
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
    console.log(`[SIP] Received message from ${rinfo.address}:${rinfo.port}`);
    console.log(`[SIP] Message preview: ${message.substring(0, 200)}...`);
    
    const parsed = parseSipMessage(message);
    console.log(`[SIP] Method: ${parsed.method || 'RESPONSE'}, Status: ${parsed.statusCode || 'N/A'}`);

    // Handle SIP responses (status codes)
    if (parsed.statusCode && parsed.statusCode >= 100) {
      console.log(`[SIP] Received response: ${parsed.statusCode} ${parsed.statusText || ''}`);
      
      // Forward responses based on Via header
      const viaHeader = parsed.headers.via;
      if (viaHeader) {
        // Extract address and port from Via header
        // Format: SIP/2.0/UDP address:port;branch=... or SIP/2.0/UDP address:port;rport;branch=...
        // Also handle: address:port;rport=xxxx;branch=...
        let viaMatch = viaHeader.match(/SIP\/2\.0\/UDP\s+([^:;,\s]+):?(\d+)?/);
        if (!viaMatch) {
          // Try alternative format with rport
          viaMatch = viaHeader.match(/rport=(\d+)/);
          if (viaMatch) {
            // Get address from the beginning
            const addrMatch = viaHeader.match(/SIP\/2\.0\/UDP\s+([^:;,\s]+)/);
            if (addrMatch) {
              const forwardAddress = addrMatch[1];
              const forwardPort = parseInt(viaMatch[1]);
              
              // Remove top Via header before forwarding
              const lines = message.split('\r\n');
              let newMessage = '';
              let viaRemoved = false;
              for (const line of lines) {
                if (!viaRemoved && line.toLowerCase().startsWith('via:')) {
                  viaRemoved = true;
                  continue; // Skip first Via header
                }
                newMessage += line + '\r\n';
              }
              
              console.log(`[SIP] Forwarding response ${parsed.statusCode} to ${forwardAddress}:${forwardPort}`);
              if (sipServer) {
                sipServer.send(newMessage, forwardPort, forwardAddress, (err) => {
                  if (err) {
                    console.error(`[SIP] Error forwarding response:`, err);
                  } else {
                    console.log(`[SIP] Response forwarded successfully`);
                  }
                });
              }
              return;
            }
          }
        } else {
          const forwardAddress = viaMatch[1];
          const forwardPort = viaMatch[2] ? parseInt(viaMatch[2]) : 5060;
          
          // Remove top Via header before forwarding
          const lines = message.split('\r\n');
          let newMessage = '';
          let viaRemoved = false;
          for (const line of lines) {
            if (!viaRemoved && line.toLowerCase().startsWith('via:')) {
              viaRemoved = true;
              continue; // Skip first Via header
            }
            newMessage += line + '\r\n';
          }
          
          console.log(`[SIP] Forwarding response ${parsed.statusCode} to ${forwardAddress}:${forwardPort}`);
          if (sipServer) {
            sipServer.send(newMessage, forwardPort, forwardAddress, (err) => {
              if (err) {
                console.error(`[SIP] Error forwarding response:`, err);
              } else {
                console.log(`[SIP] Response forwarded successfully`);
              }
            });
          }
        }
      }
      return; // Don't send response to responses
    }

    let response: string;

    if (parsed.method === 'REGISTER') {
      response = handleRegister(message, rinfo);
    } else if (parsed.method === 'INVITE') {
      response = handleInvite(message, rinfo);
    } else if (parsed.method === 'BYE') {
      response = handleBye(message, rinfo);
    } else if (parsed.method === 'OPTIONS') {
      response = handleOptions(message, rinfo);
    } else if (parsed.method === 'ACK') {
      // ACK doesn't require response, but we might need to forward it
      console.log(`[SIP] ACK received`);
      // Forward ACK if it's part of a call
      const ackParsed = parseSipMessage(message);
      const to = ackParsed.headers.to || '';
      const targetUsername = extractUsername(to);
      if (targetUsername) {
        const registration = registrations.get(targetUsername);
        if (registration) {
          forwardMessage(message, registration.contact, rinfo);
        }
      }
      return;
    } else if (parsed.method === 'CANCEL') {
      // CANCEL - respond with 200 OK
      console.log(`[SIP] CANCEL received`);
      const cancelParsed = parseSipMessage(message);
      response = `SIP/2.0 200 OK\r\n` +
        `Via: ${cancelParsed.headers.via}\r\n` +
        `From: ${cancelParsed.headers.from}\r\n` +
        `To: ${cancelParsed.headers.to}\r\n` +
        `Call-ID: ${cancelParsed.headers['call-id']}\r\n` +
        `CSeq: ${cancelParsed.headers.cseq}\r\n` +
        `Content-Length: 0\r\n\r\n`;
    } else {
      console.log(`[SIP] Unhandled method: ${parsed.method}`);
      response = 'SIP/2.0 501 Not Implemented\r\n\r\n';
    }

    if (response && sipServer) {
      console.log(`[SIP] Sending response:\n${response.substring(0, 200)}...`);
      sipServer.send(response, rinfo.port, rinfo.address, (err) => {
        if (err) {
          console.error('[SIP] Error sending response:', err);
        } else {
          console.log(`[SIP] Response sent successfully to ${rinfo.address}:${rinfo.port}`);
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

