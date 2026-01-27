#!/bin/bash

# Server setup script for Digital Ocean Droplet
# Run this once on your droplet: bash <(curl -s https://raw.githubusercontent.com/yourusername/web-sip/main/setup-server.sh)
# Or copy and run: ./setup-server.sh

set -e

echo "🚀 Setting up Digital Ocean Droplet for Voice Rooms..."

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 20
echo "📦 Installing Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
else
  echo "✓ Node.js already installed: $(node --version)"
fi

# Install PM2
echo "📦 Installing PM2..."
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
else
  echo "✓ PM2 already installed: $(pm2 --version)"
fi

# Install Janus Gateway
echo "📦 Installing Janus Gateway..."
if ! command -v janus &> /dev/null; then
  apt install -y janus
else
  echo "✓ Janus Gateway already installed"
fi

# Install Nginx
echo "📦 Installing Nginx..."
if ! command -v nginx &> /dev/null; then
  apt install -y nginx
else
  echo "✓ Nginx already installed"
fi

# Configure firewall
echo "🔥 Configuring firewall..."
ufw --force enable || true
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8188/tcp
ufw allow 5060/udp
ufw allow 10000:10200/udp

# Create app directory
echo "📁 Creating app directory..."
mkdir -p /opt/voice-rooms

# Enable Janus service
echo "⚙️  Enabling Janus service..."
systemctl enable janus
systemctl start janus || echo "⚠️  Janus may need configuration before starting"

# Configure Nginx reverse proxy
echo "🔧 Configuring Nginx reverse proxy..."
DROPLET_IP=$(hostname -I | awk '{print $1}')
APP_PORT=3000

cat > /etc/nginx/sites-available/voice-rooms << EOF
server {
    listen 80;
    server_name ${DROPLET_IP} _;

    # Increase timeouts for WebSocket connections
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;

    # Main application
    location / {
        proxy_pass http://localhost:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket support for Janus
    # Trailing slash in proxy_pass strips /janus path when forwarding
    location /janus {
        proxy_pass http://localhost:8188/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
EOF

# Enable the Nginx site
if [ -L /etc/nginx/sites-enabled/default ]; then
  rm /etc/nginx/sites-enabled/default
fi

if [ ! -L /etc/nginx/sites-enabled/voice-rooms ]; then
  ln -s /etc/nginx/sites-available/voice-rooms /etc/nginx/sites-enabled/
fi

# Test and start Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

echo ""
echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure Janus Gateway:"
echo "   - Edit /etc/janus/janus.transport.websockets.jcfg"
echo "   - Edit /etc/janus/janus.plugin.audiobridge.jcfg"
echo "   - Edit /etc/janus/janus.plugin.sip.jcfg"
echo "2. Deploy your code using ./deploy.sh your-droplet-ip"
echo "3. Create config.json in /opt/voice-rooms/"
echo ""
echo "Your app will be accessible at: http://${DROPLET_IP}/ (after deployment)"

