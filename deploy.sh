#!/bin/bash

# Deployment script for Digital Ocean Droplet
# Usage: ./deploy.sh [droplet-ip] [user]

set -e

DROPLET_IP="${1:-${DROPLET_IP}}"
DROPLET_USER="${2:-${DROPLET_USER:-root}}"
REMOTE_PATH="${REMOTE_PATH:-/opt/voice-rooms}"

if [ -z "$DROPLET_IP" ]; then
  echo "Error: Droplet IP not provided"
  echo "Usage: ./deploy.sh <droplet-ip> [user]"
  echo "Or set DROPLET_IP environment variable"
  exit 1
fi

echo "🚀 Deploying to $DROPLET_USER@$DROPLET_IP:$REMOTE_PATH"

# Build locally first
echo "📦 Building project..."
npm run build

# Sync files (excluding node_modules, .git, dist, and config.json)
echo "📤 Syncing files..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  --exclude config.json \
  --exclude '*.log' \
  --exclude .env \
  ./ ${DROPLET_USER}@${DROPLET_IP}:${REMOTE_PATH}/

# Install dependencies and restart on server
echo "⚙️  Installing dependencies and restarting service..."
ssh ${DROPLET_USER}@${DROPLET_IP} << EOF
  set -e
  
  # Check for Node.js and install if missing
  if ! command -v node &> /dev/null; then
    echo "⚠️  Node.js is not installed. Installing Node.js 20..."
    # Try without sudo first (if running as root), fallback to sudo if needed
    if [ "\$EUID" -eq 0 ]; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt install -y nodejs
    else
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
      sudo apt install -y nodejs
    fi
    echo "✓ Node.js installed successfully"
  fi
  
  # Check for npm (should come with Node.js, but verify)
  if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed on the server"
    echo "Node.js version: \$(node --version 2>/dev/null || echo 'unknown')"
    echo "This is unusual - npm should come with Node.js. Please check your installation."
    exit 1
  fi
  
  echo "✓ Node.js version: \$(node --version)"
  echo "✓ npm version: \$(npm --version)"
  
  cd ${REMOTE_PATH}
  echo "Installing dependencies (including dev dependencies for build)..."
  npm install
  echo "Building TypeScript..."
  npm run build
  
  # Check for PM2
  if ! command -v pm2 &> /dev/null; then
    echo "⚠️  Warning: PM2 is not installed. Installing globally..."
    npm install -g pm2
  fi
  
  echo "Restarting PM2 process..."
  pm2 restart voice-rooms || pm2 start dist/index.js --name voice-rooms
  pm2 save
  echo "✅ Deployment complete!"
EOF

echo "🎉 Deployment finished successfully!"

