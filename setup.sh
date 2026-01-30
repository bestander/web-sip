#!/bin/bash

# One-time setup script for Voice Rooms server
# This script sets up the entire server environment including:
# - System packages and dependencies
# - Node.js and PM2
# - Janus Gateway with admin API
# - Nginx reverse proxy
# - Firewall configuration
# - Optional HTTPS (if DOMAIN_NAME is provided)
#
# Usage:
#   ./setup.sh                    # Basic setup with HTTP
#   DOMAIN_NAME=example.com ./setup.sh  # Setup with HTTPS via Let's Encrypt

set -e

echo "🚀 Voice Rooms - One-Time Setup Script"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DROPLET_IP="${DROPLET_IP:-$(hostname -I | awk '{print $1}')}"
APP_PORT="${APP_PORT:-3000}"
DOMAIN_NAME="${DOMAIN_NAME:-}"
ADMIN_SECRET="${ADMIN_SECRET:-janusoverlord}"

echo -e "${BLUE}Configuration:${NC}"
echo "   Server IP: ${DROPLET_IP}"
echo "   App Port: ${APP_PORT}"
echo "   Domain: ${DOMAIN_NAME:-'(not set - will use HTTP only)'}"
echo ""

# Step 1: Update system
echo -e "${BLUE}📦 Step 1: Updating system packages...${NC}"
apt update && apt upgrade -y
echo -e "${GREEN}✓${NC} System updated"
echo ""

# Step 2: Install Node.js 20
echo -e "${BLUE}📦 Step 2: Installing Node.js 20...${NC}"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
  echo -e "${GREEN}✓${NC} Node.js installed: $(node --version)"
else
  echo -e "${GREEN}✓${NC} Node.js already installed: $(node --version)"
fi
echo ""

# Step 3: Install PM2
echo -e "${BLUE}📦 Step 3: Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
  echo -e "${GREEN}✓${NC} PM2 installed: $(pm2 --version)"
else
  echo -e "${GREEN}✓${NC} PM2 already installed: $(pm2 --version)"
fi
echo ""

# Step 4: Install Janus Gateway
echo -e "${BLUE}📦 Step 4: Installing Janus Gateway...${NC}"
if ! command -v janus &> /dev/null; then
  apt install -y janus
  echo -e "${GREEN}✓${NC} Janus Gateway installed"
else
  echo -e "${GREEN}✓${NC} Janus Gateway already installed"
fi
echo ""

# Step 5: Install Nginx
echo -e "${BLUE}📦 Step 5: Installing Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
  apt install -y nginx
  echo -e "${GREEN}✓${NC} Nginx installed"
else
  echo -e "${GREEN}✓${NC} Nginx already installed"
fi
echo ""

# Step 6: Configure firewall
echo -e "${BLUE}🔥 Step 6: Configuring firewall...${NC}"
ufw --force enable || true
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8188/tcp
ufw allow 5060/udp
ufw allow 10000:10200/udp
echo -e "${GREEN}✓${NC} Firewall configured"
echo ""

# Step 7: Create app directory
echo -e "${BLUE}📁 Step 7: Creating app directory...${NC}"
mkdir -p /opt/voice-rooms
echo -e "${GREEN}✓${NC} App directory created: /opt/voice-rooms"
echo ""

# Step 8: Configure Janus admin API
echo -e "${BLUE}⚙️  Step 8: Configuring Janus admin API...${NC}"
JANUS_CONFIG="/etc/janus/janus.jcfg"
HTTP_TRANSPORT_CONFIG="/etc/janus/janus.transport.http.jcfg"

if [ ! -f "$JANUS_CONFIG" ]; then
  echo -e "${YELLOW}⚠️${NC}  Janus config file not found at $JANUS_CONFIG"
  echo "   Janus may need to be installed or configured manually"
else
  # Backup original config
  if [ ! -f "${JANUS_CONFIG}.backup.initial" ]; then
    cp "$JANUS_CONFIG" "${JANUS_CONFIG}.backup.initial" 2>/dev/null || true
    echo "   Backed up original config"
  fi
  
  # Check if admin_secret exists in general section
  if ! grep -q "admin_secret" "$JANUS_CONFIG" 2>/dev/null; then
    echo "   Adding admin_secret to general section..."
    if grep -q "debug_level" "$JANUS_CONFIG"; then
      sed -i '/debug_level = /a\        admin_secret = "'"$ADMIN_SECRET"'"' "$JANUS_CONFIG"
    else
      sed -i '/general: {/a\        admin_secret = "'"$ADMIN_SECRET"'"' "$JANUS_CONFIG"
    fi
    echo "   Admin secret configured"
  else
    echo "   Admin secret already configured"
  fi

  # Check if admin_http section exists in main config
  if ! grep -q "admin_http:" "$JANUS_CONFIG" 2>/dev/null; then
    echo "   Adding admin_http section to main config..."
    cat >> "$JANUS_CONFIG" << EOF

# Admin HTTP API configuration
admin_http: {
	admin_http = true
	admin_http_port = 7088
}
EOF
    echo "   Admin HTTP section added to main config"
  else
    echo "   Admin HTTP section exists in main config"
    # Ensure admin_http is enabled
    if grep -q "admin_http = false" "$JANUS_CONFIG" 2>/dev/null; then
      sed -i 's/admin_http = false/admin_http = true/' "$JANUS_CONFIG"
      echo "   Enabled admin_http in main config"
    fi
    # Ensure port is set
    if ! grep -q "admin_http_port" "$JANUS_CONFIG" 2>/dev/null; then
      sed -i '/admin_http = true/a\	admin_http_port = 7088' "$JANUS_CONFIG"
      echo "   Added admin_http_port to main config"
    fi
  fi

  # CRITICAL: Configure HTTP transport config (this is what actually enables the admin API)
  if [ -f "$HTTP_TRANSPORT_CONFIG" ]; then
    echo "   Configuring HTTP transport admin API..."
    # Enable admin_http in HTTP transport config
    if grep -q "admin_http = false" "$HTTP_TRANSPORT_CONFIG"; then
      sed -i 's/admin_http = false/admin_http = true/' "$HTTP_TRANSPORT_CONFIG"
      echo "   Enabled admin_http in HTTP transport config"
    elif ! grep -q "admin_http = true" "$HTTP_TRANSPORT_CONFIG"; then
      # Check if there's an admin section
      if grep -q "^admin:" "$HTTP_TRANSPORT_CONFIG"; then
        # Add admin_http = true to admin section
        sed -i '/^admin:/a\        admin_http = true' "$HTTP_TRANSPORT_CONFIG"
        echo "   Added admin_http = true to HTTP transport config"
      fi
    else
      echo "   admin_http already enabled in HTTP transport config"
    fi
    
    # Ensure admin_port is set to 7088
    if grep -q "admin_port" "$HTTP_TRANSPORT_CONFIG"; then
      sed -i 's/admin_port = [0-9]*/admin_port = 7088/' "$HTTP_TRANSPORT_CONFIG" 2>/dev/null || true
      echo "   admin_port set to 7088 in HTTP transport config"
    else
      # Add admin_port if it doesn't exist
      if grep -q "^admin:" "$HTTP_TRANSPORT_CONFIG"; then
        sed -i '/^admin:/a\        admin_port = 7088' "$HTTP_TRANSPORT_CONFIG"
        echo "   Added admin_port = 7088 to HTTP transport config"
      fi
    fi
  else
    echo -e "${YELLOW}⚠️${NC}  HTTP transport config not found at $HTTP_TRANSPORT_CONFIG"
    echo "   Admin API may not work without this config"
  fi

  echo -e "${GREEN}✓${NC} Janus admin API configuration updated"
fi
echo ""

# Step 9: Enable and start Janus service
echo -e "${BLUE}⚙️  Step 9: Starting Janus service...${NC}"
systemctl enable janus
systemctl restart janus || echo -e "${YELLOW}⚠️${NC}  Janus may need additional configuration"
sleep 5

# Verify Janus started correctly
if systemctl is-active --quiet janus; then
  echo -e "${GREEN}✓${NC} Janus service is running"
  
  # Wait a bit for Janus to fully initialize
  sleep 2
  
  # Check if admin API is responding
  MAX_RETRIES=5
  RETRY_COUNT=0
  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s -f -X POST http://localhost:7088/admin \
        -H "Content-Type: application/json" \
        -d '{"janus":"info"}' > /dev/null 2>&1; then
      echo -e "${GREEN}✓${NC} Janus admin API is responding"
      break
    else
      RETRY_COUNT=$((RETRY_COUNT + 1))
      if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo "   Waiting for admin API... (attempt $RETRY_COUNT/$MAX_RETRIES)"
        sleep 2
      else
        echo -e "${YELLOW}⚠️${NC}  Admin API not responding yet (may need more time)"
        echo "   Check logs: journalctl -u janus -n 50"
      fi
    fi
  done
else
  echo -e "${RED}✗${NC} Janus service failed to start"
  echo "   Check logs: journalctl -u janus -n 50"
fi
echo ""

# Step 10: Configure Nginx
echo -e "${BLUE}🔧 Step 10: Configuring Nginx reverse proxy...${NC}"

# Install certbot if domain is provided
if [ -n "$DOMAIN_NAME" ]; then
  if ! command -v certbot &> /dev/null; then
    echo "   Installing certbot for Let's Encrypt..."
    apt install -y certbot python3-certbot-nginx
  fi
fi

# Create SSL directory and generate self-signed certificate if needed
mkdir -p /etc/nginx/ssl
SELF_SIGNED_CERT="/etc/nginx/ssl/voice-rooms.crt"
SELF_SIGNED_KEY="/etc/nginx/ssl/voice-rooms.key"

if [ -z "$DOMAIN_NAME" ]; then
  # Generate self-signed certificate if it doesn't exist
  if [ ! -f "$SELF_SIGNED_CERT" ] || [ ! -f "$SELF_SIGNED_KEY" ]; then
    echo "   Generating self-signed SSL certificate..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "$SELF_SIGNED_KEY" \
      -out "$SELF_SIGNED_CERT" \
      -subj "/C=US/ST=State/L=City/O=Voice Rooms/CN=${DROPLET_IP}" 2>/dev/null || {
      echo -e "${YELLOW}⚠️${NC}  Failed to generate self-signed certificate (openssl may not be installed)"
      echo "   Installing openssl..."
      apt install -y openssl
      openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SELF_SIGNED_KEY" \
        -out "$SELF_SIGNED_CERT" \
        -subj "/C=US/ST=State/L=City/O=Voice Rooms/CN=${DROPLET_IP}"
    }
    echo -e "${GREEN}✓${NC} Self-signed certificate created"
  fi
fi

# Create Nginx configuration - always use HTTPS
if [ -n "$DOMAIN_NAME" ]; then
  # HTTPS configuration with Let's Encrypt
  cat > /etc/nginx/sites-available/voice-rooms << EOF
server {
    listen 80;
    server_name ${DOMAIN_NAME} ${DROPLET_IP} _;

    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN_NAME} ${DROPLET_IP} _;

    # SSL configuration (will be updated by certbot)
    ssl_certificate /etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

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
else
  # HTTPS configuration with self-signed certificate
  cat > /etc/nginx/sites-available/voice-rooms << EOF
server {
    listen 80;
    server_name ${DROPLET_IP} _;

    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DROPLET_IP} _;

    # SSL configuration (self-signed)
    ssl_certificate ${SELF_SIGNED_CERT};
    ssl_certificate_key ${SELF_SIGNED_KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

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
fi

# Enable the Nginx site
if [ -L /etc/nginx/sites-enabled/default ]; then
  rm /etc/nginx/sites-enabled/default
fi

if [ ! -L /etc/nginx/sites-enabled/voice-rooms ]; then
  ln -s /etc/nginx/sites-available/voice-rooms /etc/nginx/sites-enabled/
fi

# Test Nginx configuration
nginx -t

# Get Let's Encrypt certificate if domain is provided
if [ -n "$DOMAIN_NAME" ]; then
  echo "   Obtaining Let's Encrypt certificate..."
  certbot --nginx -d ${DOMAIN_NAME} --non-interactive --agree-tos --email admin@${DOMAIN_NAME} --redirect || {
    echo -e "${YELLOW}⚠️${NC}  Certbot failed. Falling back to self-signed certificate..."
    echo "   To fix later:"
    echo "   1. Ensure DNS points ${DOMAIN_NAME} to ${DROPLET_IP}"
    echo "   2. Ensure ports 80 and 443 are open"
    echo "   3. Run certbot manually: certbot --nginx -d ${DOMAIN_NAME}"
    echo ""
    echo "   For now, using self-signed certificate for HTTPS..."
    
    # Update nginx config to use self-signed certificate
    sed -i "s|ssl_certificate /etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem;|ssl_certificate ${SELF_SIGNED_CERT};|" /etc/nginx/sites-available/voice-rooms
    sed -i "s|ssl_certificate_key /etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem;|ssl_certificate_key ${SELF_SIGNED_KEY};|" /etc/nginx/sites-available/voice-rooms
    
    # Generate self-signed cert if it doesn't exist
    if [ ! -f "$SELF_SIGNED_CERT" ]; then
      openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SELF_SIGNED_KEY" \
        -out "$SELF_SIGNED_CERT" \
        -subj "/C=US/ST=State/L=City/O=Voice Rooms/CN=${DOMAIN_NAME}"
    fi
    
    # Test config again
    nginx -t
  }
fi

# Start Nginx
systemctl restart nginx
systemctl enable nginx
echo -e "${GREEN}✓${NC} Nginx configured and started"
echo ""

# Step 11: Verify services
echo -e "${BLUE}🔍 Step 11: Verifying services...${NC}"

# Check Janus admin API
if curl -s -f -X POST http://localhost:7088/admin \
    -H "Content-Type: application/json" \
    -d '{"janus":"info"}' > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Janus admin API is accessible"
else
  echo -e "${YELLOW}⚠️${NC}  Janus admin API may not be accessible yet"
  echo "   This is normal if Janus just started - it may need a few more seconds"
  echo "   Check: journalctl -u janus -n 50"
  echo "   If it still doesn't work, re-run this setup script or manually fix:"
  echo "   Edit /etc/janus/janus.transport.http.jcfg and set admin_http = true"
fi

# Check Janus WebSocket port
if (netstat -tuln 2>/dev/null | grep -q ":8188") || (ss -tuln 2>/dev/null | grep -q ":8188"); then
  echo -e "${GREEN}✓${NC} Janus WebSocket port 8188 is listening"
else
  echo -e "${YELLOW}⚠️${NC}  Janus WebSocket port 8188 is not listening"
fi

# Check Nginx
if systemctl is-active --quiet nginx; then
  echo -e "${GREEN}✓${NC} Nginx is running"
else
  echo -e "${RED}✗${NC} Nginx is not running"
fi

echo ""

# Summary
echo "======================================"
echo -e "${GREEN}✅ Setup complete!${NC}"
echo "======================================"
echo ""
echo "Configuration Summary:"
echo "   • Node.js: $(node --version)"
echo "   • PM2: $(pm2 --version 2>/dev/null || echo 'installed')"
echo "   • Janus: $(janus --version 2>/dev/null | head -1 || echo 'installed')"
echo "   • Janus Admin API: http://localhost:7088/admin"
echo "   • Admin Secret: ${ADMIN_SECRET}"
echo "   • Nginx: $(nginx -v 2>&1 | cut -d'/' -f2)"
echo ""

if [ -n "$DOMAIN_NAME" ]; then
  echo "Your application is accessible at:"
  echo "   https://${DOMAIN_NAME}/"
  echo "   https://${DROPLET_IP}/"
else
  echo "Your application is accessible at:"
  echo "   http://${DROPLET_IP}/"
  echo ""
  echo "To enable HTTPS later, run:"
  echo "   DOMAIN_NAME=yourdomain.com ./setup.sh"
fi

echo ""
echo "Next steps:"
echo "1. Deploy your code using ./deploy.sh your-droplet-ip"
echo "2. Create config.json in /opt/voice-rooms/ with:"
echo "   {"
echo "     \"port\": ${APP_PORT},"
echo "     \"sipPassword\": \"your-shared-secret\","
echo "     \"janusUrl\": \"ws://localhost:8188/janus\","
echo "     \"janusAdminUrl\": \"http://localhost:7088/admin\","
echo "     \"janusAdminSecret\": \"${ADMIN_SECRET}\""
echo "   }"
echo "3. Run health check: bash /opt/voice-rooms/doctor.sh"
echo ""
echo "Troubleshooting:"
echo "  • If Janus admin API is not working, re-run this setup script or manually fix:"
echo "    - Edit /etc/janus/janus.transport.http.jcfg and set admin_http = true"
echo "    - Restart Janus: systemctl restart janus"
echo "  • Check Janus logs: journalctl -u janus -f"
echo "  • Check system health: bash /opt/voice-rooms/doctor.sh"
echo ""

