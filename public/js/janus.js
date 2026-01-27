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
        this.onError('WebSocket error', error);
        reject(error);
      };

      this.ws.onclose = () => {
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
        handle.handleMessage(message);
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
    if (message.janus === 'event') {
      this.onMessage(message.plugindata?.data, message.jsep);
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
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
      event.streams[0].getTracks().forEach(track => {
        this.onRemoteTrack(track, event.streams[0], true);
      });
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.janus.sendMessage({
          janus: 'trickle',
          handle_id: this.handleId,
          candidate: event.candidate
        });
      }
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
