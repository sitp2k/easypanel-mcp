# SSE Transport Support

The MCP EasyPanel Server supports both traditional stdio transport and modern Server-Sent Events (SSE) transport. This enables real-time updates for long-running operations and makes it easier to build web-based dashboards.

## Transport Modes

### 1. Stdio Transport (Default)
The standard MCP transport using stdin/stdout communication.

```bash
# Run with stdio (default)
easypanel-mcp
# or explicitly
easypanel-mcp --transport stdio
```

### 2. SSE Transport
HTTP-based transport with Server-Sent Events for real-time streaming.

```bash
# Run with SSE on default port 3001
easypanel-mcp --transport sse

# Run with SSE on custom port
easypanel-mcp --transport sse --port 8080

# Enable verbose logging
easypanel-mcp --transport sse --verbose
```

## SSE Endpoints

When running in SSE mode, the following HTTP endpoints are available:

- `POST /mcp` - Main MCP endpoint for tool execution
- `GET /progress/{sessionId}` - SSE stream for real-time progress updates
- `GET /health` - Health check endpoint
- `GET /connections` - List active connections
- `GET /dashboard` - Static files for web dashboard (optional)

## Real-time Progress Streaming

Long-running Docker operations support real-time progress updates:

- `docker_cleanup_images`
- `docker_prune_builder_cache`
- `docker_cleanup_containers`
- `docker_volumes_cleanup`
- `docker_system_prune`
- `docker_cleanup_by_project`

### Progress Updates Format

Progress updates are sent as JSON objects via SSE:

```json
{
  "type": "progress",
  "progress": {
    "toolName": "docker_cleanup_images",
    "progress": 75,
    "message": "Cleaning up unused images...",
    "timestamp": "2024-12-12T10:30:00.000Z"
  },
  "timestamp": "2024-12-12T10:30:00.000Z"
}
```

Progress values:
- `0-100`: Progress percentage
- `-1`: Operation failed

## Example Client

An example HTML client is provided at `examples/sse-client.html`. To use it:

1. Start the server with SSE transport:
   ```bash
   easypanel-mcp --transport sse
   ```

2. Open `examples/sse-client.html` in a web browser

3. Click "Connect" to establish an MCP session

4. Select a Docker tool and execute it

5. Monitor progress in real-time via the SSE stream

## Using with Claude Desktop

To use SSE transport with Claude Desktop, update your MCP configuration:

```json
{
  "mcpServers": {
    "easypanel": {
      "command": "easypanel-mcp",
      "args": ["--transport", "stdio"]  // Keep stdio for Claude Desktop
    }
  }
}
```

Note: Claude Desktop requires stdio transport. SSE transport is intended for web-based applications and custom dashboards.

## Docker Integration

### Docker Compose Example

```yaml
version: '3.8'
services:
  mcp-server:
    build: .
    command: ["--transport", "sse", "--port", "3001"]
    ports:
      - "3001:3001"
    environment:
      - EASYPANEL_API_URL=https://your-easypanel.com
      - EASYPANEL_API_TOKEN=your-token
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name mcp.example.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Special handling for SSE
        location /progress/ {
            proxy_set_header Cache-Control no-cache;
            proxy_cache_bypass $http_pragma;
            proxy_cache_bypass $http_authorization;
        }
    }
}
```

## Connection Management

- Sessions timeout after 5 minutes of inactivity
- Use the `/connections` endpoint to monitor active sessions
- Sessions are automatically cleaned up when connections are closed
- Progress history is kept for 50 recent events per session

## Monitoring

The server provides built-in monitoring endpoints:

### Health Check
```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-12-12T10:30:00.000Z",
  "connections": 3,
  "uptime": 3600
}
```

### Active Connections
```bash
curl http://localhost:3001/connections
```

Response:
```json
{
  "connections": [
    {
      "id": "session_abc123",
      "lastActivity": "2024-12-12T10:30:00.000Z",
      "isStreaming": true
    }
  ],
  "count": 1
}
```

## Security Considerations

1. **CORS**: Configure allowed origins via `SSE_CORS_ORIGIN` environment variable
2. **Authentication**: Add external authentication (JWT, OAuth) as needed
3. **Rate Limiting**: Implement rate limiting for production deployments
4. **HTTPS**: Use HTTPS in production to secure MCP communications

## Environment Variables

- `SSE_CORS_ORIGIN`: CORS allowed origin (default: *)
- `DEBUG`: Enable verbose logging when set
- `EASYPANEL_API_URL`: EasyPanel API URL
- `EASYPANEL_API_TOKEN`: EasyPanel API token

## Troubleshooting

### Port Already in Use
```bash
Error: listen EADDRINUSE :::3001
```
Solution: Use a different port:
```bash
easypanel-mcp --transport sse --port 8080
```

### Connection Timeouts
- Ensure firewall allows inbound connections to the port
- Check if reverse proxy is buffering SSE events
- Monitor connection health with `/health` endpoint

### Missing Progress Updates
- Verify the tool supports progress tracking
- Check that the client is listening to the correct `/progress/{sessionId}` endpoint
- Ensure the session ID is passed correctly in requests