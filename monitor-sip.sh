#!/bin/bash

# SIP Server Log Monitor Script
# Monitors SIP server logs with color-coded output and filtering

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Default filter (empty = show all)
FILTER=""
LOGFILE=""
FOLLOW_MODE=true

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--filter)
      FILTER="$2"
      shift 2
      ;;
    -l|--logfile)
      LOGFILE="$2"
      shift 2
      ;;
    -n|--no-follow)
      FOLLOW_MODE=false
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Monitor SIP server logs with color-coded output"
      echo ""
      echo "Options:"
      echo "  -f, --filter PATTERN    Filter logs by pattern (grep)"
      echo "  -l, --logfile FILE      Monitor specific log file"
      echo "  -n, --no-follow         Don't follow, just show recent logs"
      echo "  -h, --help              Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                      # Monitor all logs from stdin or server.log"
      echo "  $0 -f REGISTER          # Only show REGISTER messages"
      echo "  $0 -f AUTH              # Only show authentication logs"
      echo "  $0 -f ERROR             # Only show errors"
      echo "  $0 -l server.log        # Monitor specific log file"
      echo ""
      echo "Usage patterns:"
      echo "  # Run server and pipe to monitor:"
      echo "  npm start 2>&1 | $0"
      echo ""
      echo "  # Run server in background, monitor log file:"
      echo "  npm start > server.log 2>&1 &"
      echo "  $0 -l server.log"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use -h or --help for usage information"
      exit 1
      ;;
  esac
done

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  SIP Server Log Monitor${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -n "$FILTER" ]; then
  echo -e "${YELLOW}Filter: ${FILTER}${NC}"
  echo ""
fi

# Function to colorize log lines
colorize() {
  while IFS= read -r line; do
    if [[ -n "$FILTER" ]] && ! echo "$line" | grep -qi "$FILTER"; then
      continue
    fi
    
    # Color code different log types
    if echo "$line" | grep -qi "\[SIP REGISTER\]"; then
      echo -e "${CYAN}$line${NC}"
    elif echo "$line" | grep -qi "\[SIP AUTH\]"; then
      echo -e "${MAGENTA}$line${NC}"
    elif echo "$line" | grep -qi "\[SIP\].*Error\|\[SIP\].*error\|\[SIP\].*ERROR\|\[SIP\].*failed\|\[SIP\].*FAIL"; then
      echo -e "${RED}$line${NC}"
    elif echo "$line" | grep -qi "\[SIP\].*Registered\|\[SIP\].*success\|\[SIP\].*PASS"; then
      echo -e "${GREEN}$line${NC}"
    elif echo "$line" | grep -qi "\[SIP\]"; then
      echo -e "${BLUE}$line${NC}"
    else
      echo "$line"
    fi
  done
}

# Check for PM2
PM2_LOGS=""
if command -v pm2 > /dev/null 2>&1; then
  # Try to find PM2 process name (voice-rooms from deploy.sh)
  PM2_PROCESS=$(pm2 jlist 2>/dev/null | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$PM2_PROCESS" ]; then
    PM2_LOGS="$HOME/.pm2/logs/${PM2_PROCESS}-out.log"
    if [ ! -f "$PM2_LOGS" ]; then
      PM2_LOGS="$HOME/.pm2/logs/voice-rooms-out.log"
    fi
  fi
fi

# Determine input source
if [ -n "$LOGFILE" ]; then
  # Monitor specific log file
  if [ ! -f "$LOGFILE" ]; then
    echo -e "${RED}Error: Log file not found: $LOGFILE${NC}"
    exit 1
  fi
  echo -e "${BLUE}Monitoring log file: $LOGFILE${NC}"
  echo -e "${GREEN}Monitoring... (Press Ctrl+C to stop)${NC}"
  echo ""
  if [ "$FOLLOW_MODE" = true ]; then
    tail -f "$LOGFILE" 2>/dev/null | colorize
  else
    cat "$LOGFILE" | colorize
  fi
elif [ -n "$PM2_LOGS" ] && [ -f "$PM2_LOGS" ]; then
  # Auto-detect PM2 logs
  echo -e "${BLUE}Found PM2 logs: $PM2_LOGS${NC}"
  echo -e "${GREEN}Monitoring... (Press Ctrl+C to stop)${NC}"
  echo ""
  if [ "$FOLLOW_MODE" = true ]; then
    tail -f "$PM2_LOGS" 2>/dev/null | colorize
  else
    cat "$PM2_LOGS" | colorize
  fi
elif [ -f "server.log" ]; then
  # Auto-detect server.log
  echo -e "${BLUE}Found server.log, monitoring...${NC}"
  echo -e "${GREEN}Monitoring... (Press Ctrl+C to stop)${NC}"
  echo ""
  if [ "$FOLLOW_MODE" = true ]; then
    tail -f server.log 2>/dev/null | colorize
  else
    cat server.log | colorize
  fi
elif [ ! -t 0 ]; then
  # Input is piped (stdin)
  echo -e "${BLUE}Reading from stdin...${NC}"
  echo -e "${GREEN}Monitoring... (Press Ctrl+C to stop)${NC}"
  echo ""
  colorize
else
  # No input, provide instructions
  echo -e "${YELLOW}No input source detected.${NC}"
  echo ""
  
  # Check for PM2
  if command -v pm2 > /dev/null 2>&1; then
    echo -e "${CYAN}PM2 detected. Options:${NC}"
    echo "  pm2 logs voice-rooms | $0          # Monitor PM2 logs"
    echo "  $0                                  # Auto-detect PM2 logs (if available)"
    echo ""
  fi
  
  echo -e "${CYAN}Other options:${NC}"
  echo "  npm start 2>&1 | $0                   # Pipe server output"
  echo "  npm start > server.log 2>&1 &"
  echo "  $0 -l server.log                     # Monitor log file"
  echo ""
  
  # Check if server is running
  if pgrep -f "node.*index\|ts-node.*index\|npm.*start" > /dev/null; then
    echo -e "${GREEN}✓ Server process detected${NC}"
  elif command -v pm2 > /dev/null 2>&1 && pm2 list | grep -q "voice-rooms"; then
    echo -e "${GREEN}✓ PM2 process 'voice-rooms' detected${NC}"
  else
    echo -e "${YELLOW}⚠ Server process not found${NC}"
  fi
  
  # Check port 5060
  if command -v lsof > /dev/null; then
    echo -e "${CYAN}Checking port 5060:${NC}"
    if lsof -i :5060 > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Port 5060 is in use${NC}"
      lsof -i :5060
    else
      echo -e "${YELLOW}⚠ Port 5060 is not in use${NC}"
    fi
  fi
  echo ""
fi

