# MCP EasyPanel Server - Client Setup Guide

This guide provides detailed setup instructions for using the MCP EasyPanel Server with various AI development tools and IDEs.

## Table of Contents

- [Supported Clients](#supported-clients)
- [Claude Setup](#claude-setup)
- [Cursor Setup](#cursor-setup)
- [Windsurf Setup](#windsurf-setup)
- [Kiro Setup](#kiro-setup)
- [Web IDE Setup](#web-ide-setup)
- [Generic MCP Client Setup](#generic-mcp-client-setup)
- [Transport Options](#transport-options)
- [Troubleshooting](#troubleshooting)

## Supported Clients

| Client | Transports | Key Features | Status |
|--------|------------|--------------|---------|
| **Claude** | stdio, SSE | Full MCP support, streaming, progress | ✅ Full Support |
| **Cursor** | stdio, SSE, REST | Compact responses, stateless mode | ✅ Full Support |
| **Windsurf** | stdio, SSE, REST | Enhanced errors, streaming | ✅ Full Support |
| **Kiro** | REST API | Synchronous mode, batch execution | ✅ Full Support |
| **Web IDEs** | REST API | CORS support, batch execution | ✅ Full Support |
| **Generic MCP** | All transports | Basic compatibility | ✅ Full Support |

## Claude Setup

### Option 1: Standard MCP Configuration (stdio)

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "easypanel": {
      "command": "easypanel-mcp",
      "args": ["--transport", "stdio"],
      "description": "Manage EasyPanel projects, services, and deployments"
    }
  }
}
```

### Option 2: HTTP/SSE Transport

For remote or distributed setups:

```json
{
  "mcpServers": {
    "easypanel": {
      "command": "easypanel-mcp",
      "args": ["--transport", "sse", "--port", "3001"],
      "description": "Manage EasyPanel via HTTP/SSE",
      "env": {
        "EASYPANEL_API_URL": "http://your-easypanel-server:8080",
        "EASYPANEL_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

### Features Available

- ✅ Streaming responses for long operations
- ✅ Real-time progress updates
- ✅ Rich text formatting
- ✅ File operations
- ✅ Session persistence

### Usage Examples

```
List all projects
List services in project "my-app"
Deploy service "web" to production
Create new database "user-db"
Check system resource usage
```

## Cursor Setup

### Option 1: Standard MCP Integration

Add to Cursor's MCP configuration:

```json
{
  "mcp": {
    "servers": {
      "easypanel": {
        "command": "easypanel-mcp",
        "args": ["--client", "cursor", "--transport", "stdio"],
        "settings": {
          "description": "EasyPanel server management"
        }
      }
    }
  }
}
```

### Option 2: HTTP/SSE for Enhanced Features

```json
{
  "mcp": {
    "servers": {
      "easypanel-sse": {
        "command": "easypanel-mcp",
        "args": ["--client", "cursor", "--transport", "sse", "--port", "3001"],
        "settings": {
          "description": "EasyPanel with streaming support"
        }
      }
    }
  }
}
```

### Option 3: REST API Integration

For custom Cursor plugins or extensions:

```bash
# Start the server with REST API
easypanel-mcp --client cursor --transport rest --rest-port 3002
```

Then use the REST endpoints from Cursor:

```javascript
// Example in Cursor workspace
const response = await fetch('http://localhost:3002/api/tools/projects_list', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ limit: 10 })
});
```

### Cursor-Specific Features

- ✅ Compact response formatting
- ✅ Stateless connection mode
- ✅ Faster response times
- ✅ Batch operation support

## Windsurf Setup

### Standard Configuration

Add to Windsurf's MCP settings:

```json
{
  "mcpServers": {
    "easypanel": {
      "command": "easypanel-mcp",
      "args": ["--client", "windsurf", "--transport", "stdio"],
      "description": "EasyPanel management for Windsurf"
    }
  }
}
```

### Enhanced Configuration with Error Handling

```json
{
  "mcpServers": {
    "easypanel-enhanced": {
      "command": "easypanel-mcp",
      "args": ["--client", "windsurf", "--transport", "sse", "--port", "3001", "--verbose"],
      "env": {
        "EASYPANEL_DEBUG": "true"
      },
      "description": "EasyPanel with enhanced error reporting"
    }
  }
}
```

### Windsurf-Specific Features

- ✅ Enhanced error messages with troubleshooting
- ✅ Streaming support for long operations
- ✅ Automatic retry on failures
- ✅ Detailed logging

## Kiro Setup

Kiro works best with the REST API transport due to its preference for synchronous operations.

### Start Server for Kiro

```bash
easypanel-mcp --client kiro --transport rest --rest-port 3002 --verbose
```

### API Endpoints

| Endpoint | Method | Description |
|----------|---------|-------------|
| `/api/health` | GET | Check server health |
| `/api/tools` | GET | List available tools |
| `/api/tools/{tool}` | GET | Get tool information |
| `/api/tools/{tool}` | POST | Execute a tool |
| `/api/tools/batch` | POST | Execute multiple tools |

### Example Usage with Kiro

```python
# Python example for Kiro
import requests
import json

# Base URL
base_url = "http://localhost:3002/api"

# List projects
response = requests.post(f"{base_url}/tools/projects_list")
projects = response.json()

# Create a new service
service_data = {
  "project": "my-app",
  "name": "web",
  "image": "nginx:latest",
  "ports": ["80:80"]
}
response = requests.post(f"{base_url}/tools/services_create", json=service_data)

# Batch operations
batch_data = {
  "tools": [
    {"name": "projects_list"},
    {"name": "services_list", "args": {"limit": 5}}
  ]
}
response = requests.post(f"{base_url}/tools/batch", json=batch_data)
```

### Kiro-Specific Features

- ✅ Synchronous execution mode
- ✅ Batch operation support
- ✅ Simple REST API
- ✅ No streaming dependency

## Web IDE Setup

For web-based IDEs and browser applications, use the REST API with CORS support.

### Server Configuration

```bash
# Start with REST API and public CORS
easypanel-mcp --transport rest --rest-port 3002 --verbose
```

### Frontend Integration

```javascript
// Example React/ Vue/ Angular integration
class EasyPanelAPI {
  constructor(baseUrl = 'http://localhost:3002/api') {
    this.baseUrl = baseUrl;
  }

  async executeTool(toolName, args = {}) {
    const response = await fetch(`${this.baseUrl}/tools/${toolName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCP-Session-ID': this.generateSessionId()
      },
      body: JSON.stringify(args)
    });
    return response.json();
  }

  async listProjects(limit = 10) {
    return this.executeTool('projects_list', { limit });
  }

  async createService(project, name, image, ports = []) {
    return this.executeTool('services_create', {
      project,
      name,
      image,
      ports
    });
  }

  async batchExecute(tools) {
    const response = await fetch(`${this.baseUrl}/tools/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCP-Session-ID': this.generateSessionId()
      },
      body: JSON.stringify({ tools })
    });
    return response.json();
  }

  generateSessionId() {
    return 'session_' + Math.random().toString(36).substr(2, 9);
  }
}

// Usage example
const api = new EasyPanelAPI();

// List projects
const projects = await api.listProjects();

// Create a service
const result = await api.createService('my-app', 'web', 'nginx:latest', ['80:80']);

// Batch operations
const batchResult = await api.batchExecute([
  { name: 'projects_list' },
  { name: 'services_list', args: { limit: 5 } }
]);
```

### Web IDE-Specific Features

- ✅ Full CORS support
- ✅ Session management
- ✅ Batch operations
- ✅ Rate limiting (configurable)
- ✅ Health check endpoints

## Generic MCP Client Setup

For any MCP-compatible client:

### Standard stdio Transport

```bash
easypanel-mcp --transport stdio --client generic
```

### HTTP/SSE Transport

```bash
easypanel-mcp --transport sse --port 3001 --client generic
```

### REST API Transport

```bash
easypanel-mcp --transport rest --rest-port 3002 --client generic
```

### All Transports (Recommended for testing)

```bash
easypanel-mcp --transport all --http-port 3001 --rest-api-port 3002
```

## Transport Options

### stdio
- **Best for**: Direct client integration
- **Features**: Full MCP protocol support
- **Use Case**: Claude Desktop, local clients
- **Command**: `--transport stdio`

### HTTP/SSE
- **Best for**: Remote connections, web clients
- **Features**: Streaming, progress updates
- **Use Case**: Web applications, remote IDEs
- **Command**: `--transport sse --port 3001`
- **Endpoints**:
  - MCP: `http://localhost:3001/mcp`
  - Progress: `http://localhost:3001/progress/{sessionId}`
  - Health: `http://localhost:3001/health`

### REST API
- **Best for**: Simple HTTP clients, web integration
- **Features**: RESTful interface, batch operations
- **Use Case**: Kiro, Web IDEs, custom integrations
- **Command**: `--transport rest --rest-port 3002`
- **Endpoints**:
  - API Base: `http://localhost:3002/api`
  - Tools: `http://localhost:3002/api/tools/{toolName}`
  - Docs: `http://localhost:3002/api/docs`

### All Transports
- **Best for**: Development, testing
- **Features**: All transports simultaneously
- **Use Case**: Multi-client testing
- **Command**: `--transport all`

## Environment Variables

Common environment variables for all clients:

```bash
# EasyPanel Configuration
EASYPANEL_API_URL=http://your-easypanel-server:8080
EASYPANEL_API_TOKEN=your-api-token

# MCP Client Detection (Override auto-detection)
MCP_CLIENT=claude  # or cursor, windsurf, kiro, web, generic

# Debug Mode
DEBUG=true

# CORS Configuration (for web clients)
SSE_CORS_ORIGIN=https://your-ide-domain.com
```

## Client Detection

The server automatically detects the client type based on:

1. HTTP headers (User-Agent, X-Client-Name, etc.)
2. Environment variables (MCP_CLIENT)
3. Request patterns

You can override auto-detection with the `--client` flag or `MCP_CLIENT` environment variable.

## Troubleshooting

### Common Issues

1. **Connection refused**
   - Check if the server is running
   - Verify the port configuration
   - Check firewall settings

2. **Client not detected**
   - Use `--client` flag to specify client type
   - Set `MCP_CLIENT` environment variable
   - Enable verbose logging with `--verbose`

3. **CORS errors (Web IDEs)**
   - Server includes CORS headers by default
   - Check if custom CORS origin is needed
   - Verify preflight requests are allowed

4. **Rate limiting**
   - Default limits: 100-300 requests per minute depending on client
   - Limits reset every minute
   - Use batch operations for efficiency

### Debug Commands

```bash
# List all supported clients
easypanel-mcp --list-clients

# Start with verbose logging
easypanel-mcp --transport <type> --verbose

# Check server health
curl http://localhost:3002/api/health

# Test client detection
curl -H "X-Client-Name: cursor" http://localhost:3002/api/client
```

### Log Locations

- **stdout/stderr**: Server logs and debug information
- **HTTP logs**: Request/response logging
- **Client detection logs**: Client type and capabilities

## Getting Help

- **GitHub Issues**: [Repository Issues](https://github.com/your-repo/easypanel-mcp/issues)
- **Documentation**: [API](http://localhost:3002/api/docs)
- **Health Check**: [Health Endpoint](http://localhost:3002/api/health)

## Security Considerations

- The server runs all transports locally by default
- For remote access, use reverse proxy with authentication
- API tokens should be passed via environment variables, not command line
- REST API includes rate limiting to prevent abuse
- CORS is configured for development; adjust for production

---

*For more detailed API documentation, visit `/api/docs` when the server is running.*