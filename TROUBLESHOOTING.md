# Troubleshooting WebSocket Connection Issues

## Error: WebSocket connection failed (1006)

This error means the browser cannot establish a WebSocket connection to Janus.

## Quick Checks

### 1. Verify Nginx Configuration

SSH into your server and check the nginx config:

```bash
ssh root@159.203.86.137
cat /etc/nginx/sites-available/voice-rooms | grep -A 10 "location /janus"
```

**It should show:**
```
location /janus {
    proxy_pass http://localhost:8188/;  # ← Note the trailing slash!
    ...
}
```

**If it shows `proxy_pass http://localhost:8188;` (no trailing slash), fix it:**

```bash
nano /etc/nginx/sites-available/voice-rooms
# Change line with proxy_pass to:
#   proxy_pass http://localhost:8188/;
# Save and exit (Ctrl+X, Y, Enter)

# Test and reload nginx
nginx -t
systemctl reload nginx
```

### 2. Check if Janus is Running

```bash
systemctl status janus
```

**If it's not running:**
```bash
systemctl start janus
systemctl enable janus
```

### 3. Check Janus WebSocket Configuration

```bash
cat /etc/janus/janus.transport.websockets.jcfg
```

**It should have:**
```json
{
    "transport": {
        "websockets": {
            "enabled": true,
            "ws": 8188,
            "ws_logging": "all"
        }
    }
}
```

**If WebSocket is not enabled, edit the file:**
```bash
nano /etc/janus/janus.transport.websockets.jcfg
# Set "enabled": true
# Restart Janus:
systemctl restart janus
```

### 4. Test Janus WebSocket Directly

From the server, test if Janus WebSocket is accessible:

```bash
# Install wscat if needed
npm install -g wscat

# Test connection
wscat -c ws://localhost:8188/
```

**If this fails, Janus WebSocket is not configured correctly.**

### 5. Check Nginx Error Logs

```bash
tail -f /var/log/nginx/error.log
```

Try connecting from the browser and watch for errors.

### 6. Check Janus Logs

```bash
journalctl -u janus -f
```

Try connecting from the browser and watch for errors.

### 7. Verify Firewall

```bash
ufw status
```

**Port 8188 should be open:**
```bash
ufw allow 8188/tcp
```

### 8. Test the Diagnostic Endpoint

After deploying, visit:
```
http://159.203.86.137/api/diagnostics
```

This will show if the server can reach Janus admin API.

## Common Issues

### Issue: Nginx returns 502 Bad Gateway
- **Cause**: Janus is not running
- **Fix**: `systemctl start janus`

### Issue: Connection timeout
- **Cause**: Firewall blocking port 8188
- **Fix**: `ufw allow 8188/tcp`

### Issue: 404 Not Found
- **Cause**: Nginx path stripping not configured (missing trailing slash)
- **Fix**: Update nginx config as shown in step 1

### Issue: Janus WebSocket not enabled
- **Cause**: WebSocket transport disabled in Janus config
- **Fix**: Enable in `/etc/janus/janus.transport.websockets.jcfg` and restart

### Issue: "No such room" error when joining
- **Cause**: Janus admin API is not reachable, so rooms cannot be created
- **Symptoms**: 
  - Diagnostics show `"reachable": false` for admin API
  - Error: "No such room (room_id)" when joining
- **Fix**: Enable Janus admin API

#### Enable Janus Admin API

1. **Check if admin API is enabled:**
   ```bash
   grep -r "admin_http" /etc/janus/janus.jcfg
   ```

2. **Edit Janus main config:**
   ```bash
   sudo nano /etc/janus/janus.jcfg
   ```

3. **Find and enable admin HTTP API:**
   Look for the `admin_http` section and ensure it's enabled:
   ```json
   {
       "admin_http": {
           "admin_http": true,
           "admin_http_port": 7088,
           "admin_http_acl": "127.,192.168."
       }
   }
   ```

4. **If the section doesn't exist, add it:**
   ```json
   {
       "general": {
           ...
       },
       "admin_http": {
           "admin_http": true,
           "admin_http_port": 7088
       }
   }
   ```

5. **Set admin secret (if not already set):**
   ```bash
   sudo nano /etc/janus/janus.jcfg
   ```
   Find `admin_secret` and set it (or add it):
   ```json
   {
       "general": {
           "admin_secret": "janusoverlord"
       }
   }
   ```

6. **Restart Janus:**
   ```bash
   sudo systemctl restart janus
   ```

7. **Verify admin API is working:**
   ```bash
   curl -X POST http://localhost:7088/admin -H "Content-Type: application/json" -d '{"janus":"info"}'
   ```
   You should get a JSON response with Janus info.

8. **Update config.json:**
   Ensure your `config.json` has the correct admin secret:
   ```json
   {
       "janusAdminUrl": "http://localhost:7088/admin",
       "janusAdminSecret": "janusoverlord"
   }
   ```

9. **Test again:**
   - Visit `/api/diagnostics` - admin API should show `"reachable": true`
   - Try joining a room - it should work now

## Testing the Fix

After making changes:

1. Restart nginx: `systemctl restart nginx`
2. Restart Janus: `systemctl restart janus`
3. Check status: `systemctl status janus nginx`
4. Test admin API: `curl -X POST http://localhost:7088/admin -d '{"janus":"info"}'`
5. Check diagnostics: Visit `/api/diagnostics` in browser
6. Try connecting from browser again

