#!/bin/bash

# Nginx setup script for Voice Rooms
# Run this on your droplet: bash setup-nginx.sh

set -e

DROPLET_IP="${1:-$(hostname -I | awk '{print $1}')}"
APP_PORT="${2:-3000}"

echo "🔧 Setting up Nginx reverse proxy for Voice Rooms..."

# Install Nginx if not installed
if ! command -v nginx &> /dev/null; then
  echo "📦 Installing Nginx..."
  apt update
  apt install -y nginx
fi

# Create Nginx configuration
echo "📝 Creating Nginx configuration..."
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

# Enable the site
if [ -L /etc/nginx/sites-enabled/default ]; then
  rm /etc/nginx/sites-enabled/default
fi

if [ ! -L /etc/nginx/sites-enabled/voice-rooms ]; then
  ln -s /etc/nginx/sites-available/voice-rooms /etc/nginx/sites-enabled/
fi

# Test Nginx configuration
echo "🧪 Testing Nginx configuration..."
nginx -t

# Configure firewall
echo "🔥 Configuring firewall..."
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8188/tcp
ufw allow 5060/udp
ufw allow 10000:10200/udp

# Restart Nginx
echo "🔄 Restarting Nginx..."
systemctl restart nginx
systemctl enable nginx

echo ""
echo "✅ Nginx setup complete!"
echo ""
echo "Your application should now be accessible at:"
echo "  http://${DROPLET_IP}/"
echo ""
echo "To check Nginx status: systemctl status nginx"
echo "To view Nginx logs: tail -f /var/log/nginx/error.log"

