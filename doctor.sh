#!/bin/bash

# Doctor script - Health check for Voice Rooms server
# Checks all services and components, outputs their status
# Usage: ./doctor.sh

echo "🏥 Voice Rooms - System Health Check"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ISSUES=0
WARNINGS=0

# Function to check service status
check_service() {
    local service_name=$1
    local display_name=$2
    
    if systemctl is-active --quiet "$service_name"; then
        echo -e "${GREEN}✓${NC} $display_name is running"
        return 0
    else
        echo -e "${RED}✗${NC} $display_name is NOT running"
        ISSUES=$((ISSUES + 1))
        return 1
    fi
}

# Function to check port listening
check_port() {
    local port=$1
    local protocol=${2:-tcp}
    local name=$3
    
    if netstat -tuln 2>/dev/null | grep -q ":${port}" || ss -tuln 2>/dev/null | grep -q ":${port}"; then
        echo -e "${GREEN}✓${NC} Port ${port}/${protocol} is listening"
        return 0
    else
        echo -e "${RED}✗${NC} Port ${port}/${protocol} is NOT listening"
        ISSUES=$((ISSUES + 1))
        return 1
    fi
}

# Function to check HTTP endpoint
check_http_endpoint() {
    local url=$1
    local name=$2
    local expected_status=${3:-200}
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$url" \
        -H "Content-Type: application/json" \
        -d '{"janus":"info"}' \
        --max-time 5 2>&1)
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | head -n -1)
    
    if [ "$HTTP_CODE" = "$expected_status" ]; then
        echo -e "${GREEN}✓${NC} $name is responding (HTTP $HTTP_CODE)"
        return 0
    elif [ -n "$HTTP_CODE" ] && [ "$HTTP_CODE" != "000" ]; then
        echo -e "${YELLOW}⚠${NC} $name returned HTTP $HTTP_CODE"
        WARNINGS=$((WARNINGS + 1))
        return 1
    else
        echo -e "${RED}✗${NC} Cannot connect to $name"
        ISSUES=$((ISSUES + 1))
        return 1
    fi
}

# Check 1: System information
echo -e "${BLUE}📊 System Information${NC}"
echo "-------------------"
echo "   OS: $(lsb_release -d 2>/dev/null | cut -f2 || uname -a)"
echo "   Hostname: $(hostname)"
echo "   IP Address: $(hostname -I | awk '{print $1}')"
echo "   Uptime: $(uptime -p 2>/dev/null || uptime | awk -F'up' '{print $2}' | awk -F',' '{print $1}')"
echo ""

# Check 2: Node.js
echo -e "${BLUE}📦 Node.js${NC}"
echo "--------"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js installed: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js is NOT installed"
    ISSUES=$((ISSUES + 1))
fi
echo ""

# Check 3: PM2
echo -e "${BLUE}📦 PM2${NC}"
echo "-----"
if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 --version 2>/dev/null || echo "installed")
    echo -e "${GREEN}✓${NC} PM2 installed: $PM2_VERSION"
    
    # Check if app is running in PM2
    if pm2 list | grep -q "voice-rooms\|web-sip"; then
        echo -e "${GREEN}✓${NC} Application is running in PM2"
        pm2 list | grep -E "voice-rooms|web-sip" | sed 's/^/   /'
    else
        echo -e "${YELLOW}⚠${NC} Application not found in PM2"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${YELLOW}⚠${NC} PM2 is NOT installed"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check 4: Janus Gateway
echo -e "${BLUE}📦 Janus Gateway${NC}"
echo "---------------"
if command -v janus &> /dev/null; then
    JANUS_VERSION=$(janus --version 2>/dev/null | head -1 || echo "installed")
    echo -e "${GREEN}✓${NC} Janus installed: $JANUS_VERSION"
else
    echo -e "${RED}✗${NC} Janus is NOT installed"
    ISSUES=$((ISSUES + 1))
fi

# Check Janus service
if systemctl is-active --quiet janus; then
    echo -e "${GREEN}✓${NC} Janus service is running"
    # Show service status details
    systemctl status janus --no-pager -l 2>/dev/null | head -5 | sed 's/^/   /' || true
else
    echo -e "${RED}✗${NC} Janus service is NOT running"
    ISSUES=$((ISSUES + 1))
fi

# Check Janus process
JANUS_PID=$(pgrep -f janus || echo "")
if [ -n "$JANUS_PID" ]; then
    echo -e "${GREEN}✓${NC} Janus process found: PID $JANUS_PID"
else
    echo -e "${RED}✗${NC} No Janus process found"
    ISSUES=$((ISSUES + 1))
fi
echo ""

# Check 5: Janus Configuration
echo -e "${BLUE}⚙️  Janus Configuration${NC}"
echo "----------------------"
JANUS_CONFIG="/etc/janus/janus.jcfg"

if [ -f "$JANUS_CONFIG" ]; then
    echo -e "${GREEN}✓${NC} Janus config file exists: $JANUS_CONFIG"
    
    # Check admin_secret
    if grep -q "admin_secret" "$JANUS_CONFIG" 2>/dev/null; then
        SECRET=$(grep "admin_secret" "$JANUS_CONFIG" | head -1 | sed 's/.*= *"\([^"]*\)".*/\1/' | sed 's/.*= *\([^ ]*\).*/\1/')
        if [ -n "$SECRET" ]; then
            echo -e "${GREEN}✓${NC} admin_secret configured: ${SECRET:0:3}*** (hidden)"
        else
            echo -e "${YELLOW}⚠${NC} admin_secret found but value unclear"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        echo -e "${RED}✗${NC} admin_secret NOT found in config"
        ISSUES=$((ISSUES + 1))
    fi
    
    # Check admin_http section
    if grep -q "admin_http:" "$JANUS_CONFIG" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} admin_http section found"
        if grep -q "admin_http = true" "$JANUS_CONFIG" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} admin_http is enabled"
        else
            echo -e "${YELLOW}⚠${NC} admin_http may not be enabled"
            WARNINGS=$((WARNINGS + 1))
        fi
        if grep -q "admin_http_port" "$JANUS_CONFIG" 2>/dev/null; then
            PORT=$(grep "admin_http_port" "$JANUS_CONFIG" | head -1 | sed 's/.*= *\([0-9]*\).*/\1/')
            echo -e "${GREEN}✓${NC} admin_http_port configured: ${PORT:-7088}"
        else
            echo -e "${YELLOW}⚠${NC} admin_http_port not explicitly set (defaults to 7088)"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        echo -e "${RED}✗${NC} admin_http section NOT found"
        ISSUES=$((ISSUES + 1))
    fi
    
    # Check config syntax
    if command -v janus &> /dev/null; then
        SYNTAX_CHECK=$(janus --configs-folder=/etc/janus --config=/etc/janus/janus.jcfg --check-config 2>&1 || true)
        if echo "$SYNTAX_CHECK" | grep -qi "error\|invalid\|failed"; then
            echo -e "${RED}✗${NC} Config syntax errors found:"
            echo "$SYNTAX_CHECK" | grep -i "error\|invalid\|failed" | head -3 | sed 's/^/   /'
            ISSUES=$((ISSUES + 1))
        else
            echo -e "${GREEN}✓${NC} Config syntax appears valid"
        fi
    fi
    
    # Check HTTP transport config (critical for admin API)
    HTTP_TRANSPORT_CONFIG="/etc/janus/janus.transport.http.jcfg"
    if [ -f "$HTTP_TRANSPORT_CONFIG" ]; then
        echo -e "${GREEN}✓${NC} HTTP transport config exists"
        if grep -q "admin_http = true" "$HTTP_TRANSPORT_CONFIG" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} admin_http is enabled in HTTP transport config"
        elif grep -q "admin_http = false" "$HTTP_TRANSPORT_CONFIG" 2>/dev/null; then
            echo -e "${RED}✗${NC} admin_http is DISABLED in HTTP transport config (this prevents admin API from working)"
            ISSUES=$((ISSUES + 1))
        else
            echo -e "${YELLOW}⚠${NC} admin_http setting not found in HTTP transport config"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        echo -e "${YELLOW}⚠${NC} HTTP transport config not found (admin API may not work)"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${RED}✗${NC} Janus config file NOT found at $JANUS_CONFIG"
    ISSUES=$((ISSUES + 1))
fi
echo ""

# Check 6: Janus Ports
echo -e "${BLUE}🔌 Janus Ports${NC}"
echo "-------------"
check_port "8188" "tcp" "Janus WebSocket"
check_port "7088" "tcp" "Janus Admin API"
check_port "5060" "udp" "SIP"
echo ""

# Check 7: Janus Admin API
echo -e "${BLUE}🌐 Janus Admin API${NC}"
echo "-----------------"
if curl -s -f -X POST http://localhost:7088/admin \
    -H "Content-Type: application/json" \
    -d '{"janus":"info"}' > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Admin API is responding"
    RESPONSE=$(curl -s -X POST http://localhost:7088/admin \
        -H "Content-Type: application/json" \
        -d '{"janus":"info"}' 2>&1)
    if echo "$RESPONSE" | grep -q "janus"; then
        VERSION=$(echo "$RESPONSE" | grep -o '"version_string":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        if [ -n "$VERSION" ] && [ "$VERSION" != "unknown" ]; then
            echo "   Janus version: $VERSION"
        fi
    fi
else
    echo -e "${RED}✗${NC} Cannot connect to Janus Admin API"
    ISSUES=$((ISSUES + 1))
    
    # Check if port is in use by another process
    if command -v lsof &> /dev/null; then
        LSOF_OUT=$(lsof -i :7088 2>/dev/null || true)
        if [ -n "$LSOF_OUT" ]; then
            echo "   Port 7088 is in use by:"
            echo "$LSOF_OUT" | sed 's/^/   /'
        fi
    elif command -v fuser &> /dev/null; then
        FUSER_OUT=$(fuser 7088/tcp 2>&1 || true)
        if [ -n "$FUSER_OUT" ]; then
            echo "   Port 7088 is in use by another process"
        fi
    fi
fi
echo ""

# Check 8: Nginx
echo -e "${BLUE}📦 Nginx${NC}"
echo "------"
if command -v nginx &> /dev/null; then
    NGINX_VERSION=$(nginx -v 2>&1 | cut -d'/' -f2)
    echo -e "${GREEN}✓${NC} Nginx installed: $NGINX_VERSION"
    check_service "nginx" "Nginx service"
    
    # Check Nginx config
    if nginx -t 2>&1 | grep -q "successful"; then
        echo -e "${GREEN}✓${NC} Nginx configuration is valid"
    else
        echo -e "${RED}✗${NC} Nginx configuration has errors:"
        nginx -t 2>&1 | grep -i "error" | head -3 | sed 's/^/   /'
        ISSUES=$((ISSUES + 1))
    fi
    
    # Check if voice-rooms site is enabled
    if [ -L /etc/nginx/sites-enabled/voice-rooms ]; then
        echo -e "${GREEN}✓${NC} voice-rooms site is enabled"
    else
        echo -e "${YELLOW}⚠${NC} voice-rooms site is NOT enabled"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${RED}✗${NC} Nginx is NOT installed"
    ISSUES=$((ISSUES + 1))
fi

# Check HTTP/HTTPS ports
check_port "80" "tcp" "HTTP"
if check_port "443" "tcp" "HTTPS"; then
    PORT_443_LISTENING=1
else
    PORT_443_LISTENING=0
fi
echo ""

# If port 443 is not listening, check if nginx config has it configured
if [ "$PORT_443_LISTENING" -eq 0 ] && [ -f /etc/nginx/sites-available/voice-rooms ]; then
    if grep -q "listen 443" /etc/nginx/sites-available/voice-rooms 2>/dev/null; then
        echo -e "${YELLOW}⚠${NC} Nginx is configured for HTTPS (port 443) but not listening"
        echo "   This may indicate:"
        echo "   - SSL certificate is missing or invalid"
        echo "   - Nginx failed to start the HTTPS server block"
        echo "   - Check nginx error logs: tail -20 /var/log/nginx/error.log"
        echo ""
    fi
fi

# Check 9: Application Configuration
echo -e "${BLUE}📄 Application Configuration${NC}"
echo "---------------------------"
CONFIG_FILE="/opt/voice-rooms/config.json"

if [ -f "$CONFIG_FILE" ]; then
    echo -e "${GREEN}✓${NC} Config file exists: $CONFIG_FILE"
    
    # Validate JSON
    if command -v python3 &> /dev/null; then
        if python3 -m json.tool "$CONFIG_FILE" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} Config file is valid JSON"
            
            # Check required fields
            if grep -q "janusAdminUrl" "$CONFIG_FILE"; then
                echo -e "${GREEN}✓${NC} janusAdminUrl configured"
            else
                echo -e "${YELLOW}⚠${NC} janusAdminUrl not found in config"
                WARNINGS=$((WARNINGS + 1))
            fi
            
            if grep -q "janusAdminSecret" "$CONFIG_FILE"; then
                echo -e "${GREEN}✓${NC} janusAdminSecret configured"
            else
                echo -e "${YELLOW}⚠${NC} janusAdminSecret not found in config"
                WARNINGS=$((WARNINGS + 1))
            fi
        else
            echo -e "${RED}✗${NC} Config file is NOT valid JSON"
            ISSUES=$((ISSUES + 1))
        fi
    else
        echo "   (Python3 not available, skipping JSON validation)"
    fi
else
    echo -e "${YELLOW}⚠${NC} Config file NOT found: $CONFIG_FILE"
    echo "   Expected location: /opt/voice-rooms/config.json"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check 10: Application Health Endpoint
echo -e "${BLUE}🏥 Application Health${NC}"
echo "-------------------"
if [ -f "$CONFIG_FILE" ]; then
    APP_PORT=$(grep -o '"port":[^,}]*' "$CONFIG_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "3000")
else
    APP_PORT="3000"
fi
if curl -s "http://localhost:${APP_PORT}/api/health" > /dev/null 2>&1; then
    HEALTH_RESPONSE=$(curl -s "http://localhost:${APP_PORT}/api/health")
    if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
        echo -e "${GREEN}✓${NC} Application is responding on port ${APP_PORT}"
        
        # Check diagnostics endpoint
        if curl -s "http://localhost:${APP_PORT}/api/diagnostics" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} Diagnostics endpoint is available"
        fi
    else
        echo -e "${YELLOW}⚠${NC} Application responded but health check failed"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${YELLOW}⚠${NC} Application is NOT responding on port ${APP_PORT}"
    echo "   Is the application running? Check: pm2 list"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check 11: Firewall
echo -e "${BLUE}🔥 Firewall${NC}"
echo "---------"
if command -v ufw &> /dev/null; then
    if ufw status | grep -q "Status: active"; then
        echo -e "${GREEN}✓${NC} UFW firewall is active"
        echo "   Allowed ports:"
        ufw status | grep "ALLOW" | sed 's/^/   /'
    else
        echo -e "${YELLOW}⚠${NC} UFW firewall is NOT active"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "   (UFW not available, skipping firewall check)"
fi
echo ""

# Check 12: Recent Logs
echo -e "${BLUE}📋 Recent Logs${NC}"
echo "-------------"
# Janus logs
if systemctl is-active --quiet janus; then
    # Check for errors/warnings
    JANUS_ERRORS=$(journalctl -u janus -n 50 --no-pager --since "5 minutes ago" 2>/dev/null | grep -iE "error|fatal|failed|warn" || true)
    if [ -n "$JANUS_ERRORS" ]; then
        echo -e "${YELLOW}⚠${NC} Recent Janus errors/warnings:"
        echo "$JANUS_ERRORS" | head -5 | sed 's/^/   /'
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓${NC} No recent Janus errors"
    fi
    
    # Show recent startup info if admin API is not working
    if ! curl -s -f -X POST http://localhost:7088/admin \
        -H "Content-Type: application/json" \
        -d '{"janus":"info"}' > /dev/null 2>&1; then
        echo "   Recent Janus startup logs:"
        journalctl -u janus -n 20 --no-pager 2>/dev/null | tail -10 | sed 's/^/   /' || true
    fi
fi

# Nginx logs
if systemctl is-active --quiet nginx; then
    NGINX_ERRORS=$(tail -20 /var/log/nginx/error.log 2>/dev/null | grep -i "error\|warn" | tail -3)
    if [ -n "$NGINX_ERRORS" ]; then
        echo -e "${YELLOW}⚠${NC} Recent Nginx errors:"
        echo "$NGINX_ERRORS" | sed 's/^/   /'
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓${NC} No recent Nginx errors"
    fi
fi
echo ""

# Summary
echo "======================================"
echo -e "${BLUE}📊 Summary${NC}"
echo "======================================"
echo ""

if [ $ISSUES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! System is healthy.${NC}"
elif [ $ISSUES -eq 0 ]; then
    echo -e "${YELLOW}⚠️  System is mostly healthy with $WARNINGS warning(s).${NC}"
else
    echo -e "${RED}❌ Found $ISSUES issue(s) and $WARNINGS warning(s) that need attention.${NC}"
fi
echo ""

if [ $ISSUES -gt 0 ] || [ $WARNINGS -gt 0 ]; then
    echo "💡 Quick fixes:"
    echo ""
    
    # Check for Janus config syntax errors
    if command -v janus &> /dev/null && [ -f "$JANUS_CONFIG" ]; then
        SYNTAX_CHECK=$(janus --configs-folder=/etc/janus --config=/etc/janus/janus.jcfg --check-config 2>&1 | grep -i "error\|invalid\|failed\|syntax" || true)
        if [ -n "$SYNTAX_CHECK" ]; then
            echo "   🔧 Janus config has syntax errors:"
            echo "      Re-run setup script: bash /opt/voice-rooms/setup.sh"
            echo "      Or manually fix: sudo nano /etc/janus/janus.jcfg"
            echo ""
        fi
    fi
    
    if ! systemctl is-active --quiet janus; then
        echo "   • Start Janus: sudo systemctl start janus"
    fi
    
    # Check if port 7088 is not listening but Janus is running
    if systemctl is-active --quiet janus && ! netstat -tuln 2>/dev/null | grep -q ":7088" && ! ss -tuln 2>/dev/null | grep -q ":7088"; then
        echo "   🔧 Janus is running but admin API port 7088 is not listening:"
        echo "      Re-run setup script: bash /opt/voice-rooms/setup.sh"
        echo "      Or manually fix HTTP transport config: sudo nano /etc/janus/janus.transport.http.jcfg"
        echo "      Set admin_http = true in the admin: section"
        echo ""
    fi
    
    if ! systemctl is-active --quiet nginx; then
        echo "   • Start Nginx: sudo systemctl start nginx"
    fi
    
    # Check nginx proxy_pass configuration
    if [ -f /etc/nginx/sites-available/voice-rooms ]; then
        if grep -q "proxy_pass http://localhost;" /etc/nginx/sites-available/voice-rooms 2>/dev/null && ! grep -q "proxy_pass http://localhost:3000" /etc/nginx/sites-available/voice-rooms 2>/dev/null; then
            echo "   🔧 Nginx proxy_pass may be misconfigured:"
            echo "      Check: grep proxy_pass /etc/nginx/sites-available/voice-rooms"
            echo "      Should be: proxy_pass http://localhost:3000;"
            echo ""
        fi
    fi
    
    # Check if port 443 is not listening
    if ! netstat -tuln 2>/dev/null | grep -q ":443" && ! ss -tuln 2>/dev/null | grep -q ":443"; then
        echo "   🔧 Port 443 (HTTPS) is not listening:"
        echo "      Re-run setup script: bash /opt/voice-rooms/setup.sh"
        if [ -n "$DOMAIN_NAME" ]; then
            echo "      Or with domain: DOMAIN_NAME=$DOMAIN_NAME bash /opt/voice-rooms/setup.sh"
        fi
        echo "      Check nginx config: sudo nginx -t"
        echo "      Check nginx status: sudo systemctl status nginx"
        echo ""
    fi
    
    if ! grep -q "admin_http:" /etc/janus/janus.jcfg 2>/dev/null; then
        echo "   • Configure Janus admin API: Re-run setup script: bash /opt/voice-rooms/setup.sh"
        echo "     Or manually edit /etc/janus/janus.jcfg and /etc/janus/janus.transport.http.jcfg"
    fi
    
    if [ ! -f "$CONFIG_FILE" ]; then
        echo "   • Create config.json: Copy config.example.json to /opt/voice-rooms/config.json"
    fi
    
    if ! pm2 list | grep -q "voice-rooms\|web-sip"; then
        echo "   • Start application: cd /opt/voice-rooms && pm2 start dist/index.js --name voice-rooms"
    fi
    
    echo ""
    echo "   For more details:"
    echo "   • Janus logs: journalctl -u janus -n 50"
    echo "   • Nginx logs: tail -f /var/log/nginx/error.log"
    echo "   • PM2 logs: pm2 logs"
    echo "   • Check Janus: curl -X POST http://localhost:7088/admin -d '{\"janus\":\"info\"}'"
    echo "   • Re-run setup script: bash /opt/voice-rooms/setup.sh"
fi

echo ""

