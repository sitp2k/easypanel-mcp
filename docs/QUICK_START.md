# Quick Start Guide - MCP EasyPanel Server

Get started with MCP EasyPanel Server in minutes! This guide covers the fastest way to set up the server with your preferred AI client.

## Installation

```bash
# Global installation (recommended)
npm install -g easypanel-mcp

# Or install locally in your project
npm install easypanel-mcp
```

## One-Command Setup

### For Claude Desktop

```bash
# Clone the config template
curl -o ~/Library/Application\ Support/Claude/claude_desktop_config.json \
  https://raw.githubusercontent.com/your-repo/easypanel-mcp/main/configs/claude-config.json

# Start the server
easypanel-mcp --transport stdio
```

### For Cursor

```bash
# Start the server with Cursor optimizations
easypanel-mcp --client cursor --transport stdio --verbose
```

### For Windsurf

```bash
# Start with enhanced error handling
easypanel-mcp --client windsurf --transport sse --port 3001
```

### For Kiro

```bash
# Start REST API for Kiro
easypanel-mcp --client kiro --transport rest --rest-port 3002
```

### For Web IDEs

```bash
# Start with CORS-enabled REST API
easypanel-mcp --transport rest --rest-port 3002 --verbose
```

## Test Your Setup

```bash
# Check if server is running (REST API)
curl http://localhost:3002/api/health

# List available tools (REST API)
curl http://localhost:3002/api/tools

# List supported clients
easypanel-mcp --list-clients
```

## Environment Configuration

Create a `.env` file in your working directory:

```env
# EasyPanel Server
EASYPANEL_API_URL=http://your-easypanel-server:8080
EASYPANEL_API_TOKEN=your-api-token-here

# Optional: Force client type
MCP_CLIENT=claude

# Optional: Debug mode
DEBUG=true
```

## First Commands

Try these commands in your AI client:

```
# List all projects
list projects

# Show system status
check system status

# List available services in a project
list services in project "my-app"

# Create a new project
create new project "my-awesome-app"

# Deploy a service
deploy service "web" to project "my-app"
```

## Multi-Transport Mode

For testing or when using multiple clients:

```bash
# Start all transports simultaneously
easypanel-mcp --transport all --http-port 3001 --rest-api-port 3002
```

This gives you:
- stdio: For direct MCP clients
- HTTP/SSE: `http://localhost:3001/mcp`
- REST API: `http://localhost:3002/api`

## Need Help?

- **List clients**: `easypanel-mcp --list-clients`
- **Verbose mode**: Add `--verbose` flag
- **API docs**: Visit `http://localhost:3002/api/docs`
- **Health check**: `curl http://localhost:3002/api/health`

## Troubleshooting Quick Tips

1. **Port already in use?** Change ports with `--port 3003` and `--rest-port 3004`
2. **Client not detected?** Use `--client <name>` to specify
3. **API errors?** Check EASYPANEL_API_URL and EASYPANEL_API_TOKEN in .env
4. **CORS issues?** Server includes CORS headers by default for web clients

---

**Ready in 2 minutes!** 🚀

For detailed setup instructions, see [CLIENT_SETUP.md](CLIENT_SETUP.md).