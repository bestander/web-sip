// Minimal Janus client for AudioBridge and SIP plugins
// Based on official janus.js but simplified

class Janus {
  constructor(config) {
    this.server = config.server;
    this.iceServers = config.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }];
    this.onError = config.error || console.error;
    this.onDestroyed = config.destroyed || (() => {});

    this.ws = null;
    this.sessionId = null;
    this.handles = new Map();
    this.transactions = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.server, 'janus-protocol');

      this.ws.onopen = () => {
        this.sendMessage({ janus: 'create' })
          .then(response => {
            this.sessionId = response.data.id;
            this.startKeepalive();
            resolve();
          })
          .catch(reject);
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error details:', {
          url: this.server,
          readyState: this.ws?.readyState,
          error: error
        });
        this.onError('WebSocket error', error);
        reject(error);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        this.onDestroyed();
      };
    });
  }

  startKeepalive() {
    this.keepaliveInterval = setInterval(() => {
      this.sendMessage({ janus: 'keepalive', session_id: this.sessionId });
    }, 30000);
  }

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      const transaction = this.randomString(12);
      message.transaction = transaction;

      if (this.sessionId && !message.session_id) {
        message.session_id = this.sessionId;
      }

      this.transactions.set(transaction, { resolve, reject });
      this.ws.send(JSON.stringify(message));
    });
  }

  handleMessage(message) {
    const transaction = message.transaction;

    if (transaction && this.transactions.has(transaction)) {
      const { resolve, reject } = this.transactions.get(transaction);
      this.transactions.delete(transaction);

      if (message.janus === 'error') {
        reject(message.error);
      } else {
        resolve(message);
      }
      return;
    }

    // Handle async events
    if (message.sender) {
      const handle = this.handles.get(message.sender);
      if (handle) {
        console.log('Routing async event to handle:', message.sender, 'Message type:', message.janus);
        handle.handleMessage(message);
      } else {
        console.warn('No handle found for sender:', message.sender, 'Available handles:', Array.from(this.handles.keys()));
      }
    }

    // Handle trickle ICE candidates from Janus
    if (message.janus === 'trickle' && message.sender) {
      const handle = this.handles.get(message.sender);
      if (handle && handle.pc) {
        if (message.candidate) {
          handle.pc.addIceCandidate(new RTCIceCandidate(message.candidate))
            .catch(err => console.error('Failed to add ICE candidate:', err));
        } else if (message.completed) {
          // ICE gathering complete
          console.log('ICE gathering completed');
        }
      }
    }
  }

  attach(plugin) {
    return new Promise((resolve, reject) => {
      this.sendMessage({
        janus: 'attach',
        plugin: plugin.plugin
      }).then(response => {
        const handleId = response.data.id;
        plugin.handleId = handleId;
        plugin.janus = this;
        this.handles.set(handleId, plugin);
        resolve(plugin);
      }).catch(reject);
    });
  }

  destroy() {
    clearInterval(this.keepaliveInterval);
    if (this.ws) {
      this.ws.close();
    }
  }

  randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

class JanusPlugin {
  constructor(config) {
    this.plugin = config.plugin;
    this.onMessage = config.onmessage || (() => {});
    this.onLocalTrack = config.onlocaltrack || (() => {});
    this.onRemoteTrack = config.onremotetrack || (() => {});
    this.onCleanup = config.oncleanup || (() => {});

    this.handleId = null;
    this.janus = null;
    this.pc = null;
    this.localStream = null;
  }

  handleMessage(message) {
    console.log('JanusPlugin.handleMessage:', message.janus, message);
    if (message.janus === 'event') {
      console.log('Processing event, plugin data:', message.plugindata?.data, 'JSEP:', message.jsep);
      this.onMessage(message.plugindata?.data, message.jsep);
    } else if (message.janus === 'webrtcup') {
      console.log('WebRTC connection established');
    } else if (message.janus === 'hangup') {
      console.log('Call hung up');
    } else {
      console.log('Unhandled message type:', message.janus);
    }
  }

  send(body) {
    return this.janus.sendMessage({
      janus: 'message',
      handle_id: this.handleId,
      body: body
    });
  }

  sendWithJsep(body, jsep) {
    return this.janus.sendMessage({
      janus: 'message',
      handle_id: this.handleId,
      body: body,
      jsep: jsep
    });
  }

  async createOffer(options = {}) {
    if (!this.pc) {
      await this.createPeerConnection();
    }

    if (options.media?.audio) {
      try {
        // Check if getUserMedia is available
        let getUserMedia;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        } else if (navigator.getUserMedia) {
          // Fallback for older browsers
          getUserMedia = (constraints) => {
            return new Promise((resolve, reject) => {
              navigator.getUserMedia(constraints, resolve, reject);
            });
          };
        } else {
          throw new Error('getUserMedia is not available. This may be because:\n' +
            '1. The page is not served over HTTPS (required for most browsers)\n' +
            '2. Your browser does not support getUserMedia\n' +
            '3. Camera/microphone permissions are blocked');
        }

        this.localStream = await getUserMedia({ audio: true, video: false });
        this.localStream.getTracks().forEach(track => {
          this.pc.addTrack(track, this.localStream);
          this.onLocalTrack(track, true);
        });
      } catch (error) {
        console.error('Failed to get user media:', error);
        throw error;
      }
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    return { type: offer.type, sdp: offer.sdp };
  }

  async handleRemoteJsep(jsep) {
    if (!this.pc) {
      await this.createPeerConnection();
    }
    await this.pc.setRemoteDescription(new RTCSessionDescription(jsep));

    if (jsep.type === 'offer') {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      return { type: answer.type, sdp: answer.sdp };
    }
  }

  async createPeerConnection() {
    this.pc = new RTCPeerConnection({
      iceServers: this.janus.iceServers
    });

    this.pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind, event.streams);
      if (event.streams && event.streams.length > 0) {
        event.streams[0].getTracks().forEach(track => {
          this.onRemoteTrack(track, event.streams[0], true);
        });
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.janus.sendMessage({
          janus: 'trickle',
          handle_id: this.handleId,
          candidate: event.candidate
        });
      } else {
        // ICE gathering complete
        this.janus.sendMessage({
          janus: 'trickle',
          handle_id: this.handleId,
          candidate: { completed: true }
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      console.log('WebRTC connection state:', this.pc.connectionState);
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', this.pc.iceConnectionState);
    };
  }

  hangup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.onCleanup();
  }

  detach() {
    this.hangup();
    return this.janus.sendMessage({
      janus: 'detach',
      handle_id: this.handleId
    });
  }
}

// Export for use in other scripts
window.Janus = Janus;
window.JanusPlugin = JanusPlugin;
