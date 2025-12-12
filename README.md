# MCP EasyPanel Server

[![npm version](https://badge.fury.io/js/easypanel-mcp.svg)](https://badge.fury.io/js/easypanel-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

> 🚀 **Model Context Protocol (MCP) server for managing [EasyPanel](https://easypanel.io?aff=7GNAmD) deployments directly from Claude**
>
> 💝 **Proudly sponsored by [EasyPanel](https://easypanel.io?aff=7GNAmD)** - The ultimate hosting platform for developers. Support our open-source work by upgrading through our affiliate link.

## ⚠️ License Notice

This software is provided under the **MIT License**. You are free to:
- ✅ Use the software for any purpose
- ✅ Study and modify the source code
- ✅ Distribute copies under the same MIT license
- ✅ Create private forks and modifications

**Restrictions:**
- ❌ Remove copyright or license notices
- ❌ Claim ownership of original work
- ❌ Sue for damages if software fails
- ❌ Use trademark or branding without permission

**For commercial redistribution or custom licensing, please contact the author.**

*All modifications must retain the original copyright and license.*

Manage your entire EasyPanel infrastructure - projects, services, databases, domains, SSL certificates, and monitoring - through natural language commands in Claude.

---

## ✨ Key Features

### 🏗️ **Project Management**
- Create, list, inspect, and delete projects
- Real-time project status tracking
- Service orchestration within projects

### 🐳 **Application Services**
- Deploy from Docker images, Git repositories, or Dockerfiles
- Start, stop, restart, and redeploy services
- Update environment variables and resource limits
- Build logs access and monitoring

### 🗄️ **Database Services**
- Create and manage Redis, MySQL, and PostgreSQL instances
- Automatic connection string generation
- Database credentials management

### 🌐 **Domain & SSL Management**
- Add/remove custom domains
- Automatic HTTPS with Let's Encrypt
- Custom SSL certificate upload
- Certificate renewal management
- Domain validation and DNS setup

### 📊 **Monitoring & Logs**
- Real-time service statistics (CPU, memory, network)
- Container logs streaming and search
- Performance metrics tracking
- Log filtering and analysis

### 🔐 **Enterprise Security**
- JWT token-based authentication
- Secure credential management
- Session persistence
- Error handling with retry logic
- 🔒 **CVE-2025-55182 Secure** - Built with pure Node.js/TypeScript, no React dependencies

---

## 🛡️ Security Notice

### 🔒 **CVE-2025-55182 Safe Zone**
This MCP EasyPanel Server is **100% immune** to the Critical React Server Components vulnerability (CVE-2025-55182, CVSS 10.0).

#### Why We're Bulletproof:
- ✅ **Zero React Dependencies** - Pure Node.js/TypeScript architecture
- ✅ **No Server Components** - MCP Protocol, not React RSC
- ✅ **Minimal Attack Surface** - Only 3 core dependencies (`@modelcontextprotocol/sdk`, `axios`, `zod`)
- ✅ **Server-Side Only** - No frontend attack vectors

#### While Others Panic, You're Safe:
- 🚨 React apps worldwide are rushing to patch CVE-2025-55182
- 🛡️ Your MCP EasyPanel Server was never at risk
- 😌 Sleep well knowing your hosting management is secure

> **Peace of Mind Included**: Focus on deploying great apps, not patching vulnerabilities.

---

## 🚀 One-Line Installation

### Option 1: Install from npm (Recommended)
```bash
npx easypanel-mcp-install
```

### Option 2: Clone and Build
```bash
git clone https://github.com/sitp2k/easypanel-mcp.git
cd easypanel-mcp
npm install && npm run build
```

### Option 3: Install as Global Package
```bash
npm install -g easypanel-mcp
```

---

## 🎯 Quick Start

### Quick Start for Different Setups

### 🚀 **Option 1: Claude Code with Environment Variables (Easiest)**

```bash
# 1. Configure environment
echo "EASYPANEL_URL=http://your-server-ip:3000" > ~/.mcp-easypanel.env
echo "EASYPANEL_EMAIL=your-email@example.com" >> ~/.mcp-easypanel.env
echo "EASYPANEL_PASSWORD=your-password" >> ~/.mcp-easypanel.env

# 2. Add to Claude Code (reads from .env)
claude mcp add easypanel npx easypanel-mcp

# 3. Test connection
echo "List all projects to verify connection"
```

### 🔧 **Option 2: Direct Configuration in Claude Code**

```bash
# Add with explicit environment variables
claude mcp add easypanel npx easypanel-mcp \
  --env EASYPANEL_URL=http://your-server-ip:3000 \
  --env EASYPANEL_EMAIL=your-email@example.com \
  --env EASYPANEL_PASSWORD=your-password
```

### 🏠 **Option 3: Local Project Setup**

```bash
# 1. Clone and setup
git clone https://github.com/sitp2k/easypanel-mcp.git
cd easypanel-mcp
npm install && npm run build

# 2. Create .env file
cp .env.example .env
# Edit .env with your credentials:
# EASYPANEL_URL=http://your-server-ip:3000
# EASYPANEL_EMAIL=your-email@example.com
# EASYPANEL_PASSWORD=your-password

# 3. Add to Claude Code
claude mcp add easypanel node $(pwd)/dist/index.js
```

### 🌍 **Option 4: Claude Desktop (Separate App)**

Create/edit `~/.config/Claude/claude_desktop_config.json` (Linux) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "easypanel": {
      "command": "npx",
      "args": ["easypanel-mcp"],
      "env": {
        "EASYPANEL_URL": "http://your-server-ip:3000",
        "EASYPANEL_EMAIL": "your-email@example.com",
        "EASYPANEL_PASSWORD": "your-password"
      }
    }
  }
}
```

### 💻 **Option 5: VS Code with Claude Extension**
```json
{
  "mcp.servers": {
    "easypanel": {
      "command": "npx",
      "args": ["easypanel-mcp"]
    }
  }
}
```

#### **Cursor IDE**
```json
{
  "mcp": {
    "servers": {
      "easypanel": {
        "command": "npx",
        "args": ["easypanel-mcp"]
      }
    }
  }
}
```

### 3. **Verify Installation**

```bash
# Test the connection
npx easypanel-mcp-test

# Or in Claude:
"List all projects to verify the connection works"
```

---

## 📋 IDE-Specific Configuration

### Claude Desktop Configuration

**Linux**: `~/.config/Claude/claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "easypanel": {
      "command": "node",
      "args": ["/absolute/path/to/easypanel-mcp/dist/index.js"],
      "env": {
        "EASYPANEL_URL": "http://your-server-ip:3000",
        "EASYPANEL_EMAIL": "admin@example.com",
        "EASYPANEL_PASSWORD": "your-password"
      }
    }
  }
}
```

### Claude Code Project Configuration

Create `.claude/mcp.json` in your project:

```json
{
  "mcpServers": {
    "easypanel": {
      "command": "npx",
      "args": ["easypanel-mcp@latest"],
      "env": {
        "EASYPANEL_URL": "http://your-server-ip:3000",
        "EASYPANEL_EMAIL": "admin@example.com",
        "EASYPANEL_PASSWORD": "your-password"
      }
    }
  }
}
```

### VS Code with Claude Extension

Add to your `.vscode/settings.json`:

```json
{
  "claude.mcp.servers": {
    "easypanel": {
      "command": "npx",
      "args": ["easypanel-mcp"]
    }
  },
  "claude.env": {
    "EASYPANEL_URL": "http://your-server-ip:3000",
    "EASYPANEL_EMAIL": "admin@example.com",
    "EASYPANEL_PASSWORD": "your-password"
  }
}
```

---

## 🚀 Upgrade to EasyPanel Premium

This MCP server is **completely free and open-source**, proudly sponsored by [EasyPanel](https://easypanel.io?aff=7GNAmD). While the server works perfectly with EasyPanel's free tier, upgrading to **Premium** unlocks powerful features:

- 📚 **Unlimited Projects & Services** - Scale without limits
- 🔒 **Free SSL Certificates** - Automatic HTTPS with Let's Encrypt
- 📊 **Advanced Monitoring** - Detailed insights and alerts
- ⚡ **Priority Deployments** - Faster build queues
- 🛡️ **Enhanced Security** - Advanced firewall and protection
- 🎯 **Priority Support** - Get help when you need it

### 🎁 **Special Offer - Support Open Source**
When you upgrade through our affiliate link, you not only get these amazing features but also help us continue developing and maintaining this MCP server for the community.

[**🚀 Upgrade to EasyPanel Premium & Support Open Source**](https://easypanel.io?aff=7GNAmD)

*Thank you for supporting open-source development!*

---

## 🛠️ Available Tools

### 📁 Project Management

| Tool | Description | Example |
|------|-------------|---------|
| `list_projects` | List all projects and their services | "Show me all my projects" |
| `create_project` | Create a new project | "Create a project called 'webapp'" |
| `inspect_project` | Get detailed project information | "Inspect the 'webapp' project" |
| `destroy_project` | Delete a project | "Delete the project 'old-project'" |

### 🐳 Application Services

| Tool | Description | Example |
|------|-------------|---------|
| `create_app_service` | Create a new app service | "Create an app service 'api' in project 'webapp'" |
| `deploy_from_image` | Deploy from Docker image | "Deploy nginx:latest to service 'web'" |
| `deploy_from_git` | Deploy from Git repository | "Deploy from https://github.com/user/repo.git" |
| `deploy_from_dockerfile` | Deploy using Dockerfile | "Deploy the current directory using Dockerfile" |
| `start_service` | Start a stopped service | "Start service 'api' in project 'webapp'" |
| `stop_service` | Stop a running service | "Stop service 'api'" |
| `restart_service` | Restart a service | "Restart the 'api' service" |
| `redeploy_service` | Trigger new deployment | "Redeploy the 'api' service" |
| `destroy_service` | Delete a service | "Delete the service 'old-api'" |
| `update_env` | Update environment variables | "Set DATABASE_URL=postgresql://..." |
| `update_resources` | Update memory/CPU limits | "Set memory to 2048MB and CPU to 2 cores" |
| `get_service_logs` | Get service logs | "Show me the last 100 lines of logs" |
| `get_service_stats` | Get resource statistics | "Show CPU and memory usage for 'api'" |

### 🗄️ Database Services

| Tool | Description | Example |
|------|-------------|---------|
| `create_redis` | Create Redis instance | "Create a Redis database called 'cache'" |
| `inspect_redis` | Get Redis connection info | "Show Redis connection details" |
| `create_mysql` | Create MySQL database | "Create MySQL db 'mydb' with user 'app'" |
| `create_postgres` | Create PostgreSQL database | "Create PostgreSQL db 'mydb'" |
| `destroy_db_service` | Delete database service | "Delete Redis service 'cache'" |
| `update_redis_password` | Update Redis password | "Update Redis 'cache' password" |

### 🌐 Domain & SSL Management

| Tool | Description | Example | Premium |
|------|-------------|---------|--------|
| `add_domain` | Add custom domain to service | "Add example.com to service 'web'" | ✅ |
| `remove_domain` | Remove domain from service | "Remove domain with ID '123'" | ✅ |
| `list_domains` | List all domains for service | "Show all domains for service 'web'" | ✅ |
| `validate_domain` | Validate domain and DNS | "Validate domain setup for example.com" | ✅ |
| `enable_https` | Enable HTTPS with Let's Encrypt | "Enable HTTPS for example.com" | ✅ |
| `disable_https` | Disable HTTPS for domain | "Disable HTTPS for example.com" | ✅ |
| `renew_certificate` | Renew SSL certificate | "Renew SSL certificate for domain" | ✅ |
| `get_certificate` | Get SSL certificate details | "Show SSL certificate info" | ✅ |
| `upload_custom_certificate` | Upload custom SSL cert | "Upload custom certificate" | ✅ |

### 🔍 License Management

| Tool | Description | Example |
|------|-------------|---------|
| `get_license_status` | Check license status | "Show current EasyPanel license status" |
| `get_user_info` | Get user information | "Display user account details" |
| `activate_license` | Activate license | "Activate EasyPanel Premium license" |

### 📊 Advanced Monitoring

| Tool | Description | Example |
|------|-------------|---------|
| `get_advanced_stats` | System-wide statistics | "Show advanced system stats" |
| `get_system_stats` | CPU, memory, disk stats | "Display system resource usage" |
| `get_docker_task_stats` | Container statistics | "Show Docker container metrics" |
| `get_monitor_table_data` | Dashboard data | "Get monitoring dashboard data" |

---

## 💡 Usage Examples

### 🚀 Deploy a Full-Stack Application

```text
Create a project called "myapp"
Create a PostgreSQL database called "db" with user "app" and password "secret123"
Create an app service called "api"
Set environment variables:
- DATABASE_URL=postgresql://app:secret123@myapp_db:5432/myapp
- NODE_ENV=production
- PORT=3000
Deploy the API from https://github.com/user/api.git
Create another service called "frontend"
Deploy the frontend from the current directory using Dockerfile
Add domain myapp.com to the frontend service
Enable HTTPS for myapp.com
```

### 📊 Monitor and Scale

```text
Show me the resource usage for all services in project "myapp"
Get the last 50 lines of logs from the "api" service
Update resources for service "api":
- Memory limit: 2048 MB
- CPU limit: 2.0 cores
Restart the "api" service to apply changes
```

### 🔐 SSL Certificate Management

```text
Add domain api.example.com to service "api"
Validate the domain setup
Enable HTTPS for api.example.com with email admin@example.com
Check the certificate details
Upload a custom certificate for legacy.example.com
```

### 🗃️ Database Operations

```text
Create a Redis cache instance called "session-store"
Create a MySQL database with:
- Database name: "production"
- User: "app"
- Password: "secure_password"
- Host: "mysql"
Show connection details for both databases
```

---

## 🔧 Advanced Configuration

### Custom MCP Server Path

```json
{
  "mcpServers": {
    "easypanel": {
      "command": "node",
      "args": ["/custom/path/to/dist/index.js"],
      "cwd": "/workspace"
    }
  }
}
```

### Using Environment Variables in Production

```bash
# Production setup with systemd
sudo tee /etc/systemd/system/mcp-easypanel.service > /dev/null <<EOF
[Unit]
Description=MCP EasyPanel Server
After=network.target

[Service]
Type=simple
User=mcp
Environment=EASYPANEL_URL=https://panel.example.com
Environment=EASYPANEL_EMAIL=claude@example.com
Environment=EASYPANEL_PASSWORD=\${EASYPANEL_PASSWORD}
Environment=CACHE_TTL=600
ExecStart=/usr/bin/node /opt/easypanel-mcp/dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable mcp-easypanel
sudo systemctl start mcp-easypanel
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
RUN chmod +x ./dist/index.js

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  mcp-easypanel:
    build: .
    environment:
      - EASYPANEL_URL=${EASYPANEL_URL}
      - EASYPANEL_EMAIL=${EASYPANEL_EMAIL}
      - EASYPANEL_PASSWORD=${EASYPANEL_PASSWORD}
    restart: unless-stopped
```

---

## 🛠️ Development Setup

### Prerequisites

- Node.js >= 18.0.0
- TypeScript >= 5.0.0
- Git
- An [EasyPanel](https://easypanel.io?aff=7GNAmD) instance (free tier works perfectly!)

### Local Development

```bash
# Clone the repository
git clone https://github.com/sitp2k/easypanel-mcp.git
cd easypanel-mcp

# Install dependencies
npm install

# Development mode with hot reload
npm run watch

# Run directly with tsx
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Run the built version
npm start
```

### Project Structure

```
easypanel-mcp/
├── src/
│   ├── api/           # EasyPanel API client
│   ├── tools/         # MCP tool implementations
│   ├── types/         # TypeScript type definitions
│   └── index.ts       # Main server entry point
├── tests/             # Test files
├── docs/              # Documentation
├── examples/          # Usage examples
├── dist/              # Compiled JavaScript
└── package.json
```

### Adding New Tools

1. Create a new tool file in `src/tools/`
2. Export a tools object and handler function
3. Import and register in `src/index.ts`

Example:

```typescript
// src/tools/mytool.ts
export const myTool = {
  name: 'my_tool',
  description: 'My custom tool',
  inputSchema: {
    type: 'object',
    properties: { /* ... */ },
    required: [/* ... */]
  }
};

export async function handleMyTool(name: string, args: unknown) {
  // Implementation
  return { content: [{ type: 'text', text: 'Result' }] };
}
```

---

## 🔍 Troubleshooting

### Connection Issues

**Error**: `Connection refused`

```bash
# Check if EasyPanel is accessible
curl http://your-server-ip:3000/api/trpc/auth.getSession

# Verify firewall settings
sudo ufw status
sudo ufw allow 3000/tcp
```

**Error**: `Authentication failed`

1. Verify your EasyPanel credentials
2. Check if the user has admin permissions
3. Try logging in via the EasyPanel web UI first
4. Ensure you're using the correct URL (include http:// or https://)

### Service Not Found

```bash
# Service names in EasyPanel are lowercase with hyphens
# Correct: "my-app", "api-service"
# Incorrect: "MyApp", "API_SERVICE"
```

### Common Errors

| Error | Solution |
|-------|----------|
| `ECONNREFUSED` | Check EasyPanel URL and firewall |
| `401 Unauthorized` | Verify email/password are correct |
| `403 Forbidden` | User needs admin permissions |
| `Service not found` | Check service name format (lowercase-hyphens) |
| `Domain already exists` | Domain must be unique across all services |

### Debug Mode

Enable debug logging:

```bash
export DEBUG=easypanel:*
node dist/index.js
```

Or in your `.env`:

```
DEBUG=easypanel:*
```

### Performance Issues

1. **Enable caching** (default: on)
   ```
   CACHE_ENABLED=true
   CACHE_TTL=300
   ```

2. **Monitor cache statistics**
   ```javascript
   const stats = client.getCacheStats();
   console.log(`Hit rate: ${stats.hitRate}%`);
   ```

3. **Adjust timeouts for slow connections**
   ```javascript
   const client = new EasyPanelClient({
     timeout: 30000, // 30 seconds
     retryAttempts: 3
   });
   ```

---

## 🔒 Security Best Practices

1. **Never hardcode credentials in code** - Always use environment variables
2. **Use a dedicated API user** with minimal required permissions
3. **Rotate credentials regularly**
4. **Use HTTPS in production** - `EASYPANEL_URL=https://...`
5. **Consider using JWT tokens** instead of passwords for long-running sessions
6. **Audit access logs** in EasyPanel regularly

---

## 📚 Additional Resources

- [EasyPanel Documentation](https://easypanel.io/docs)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Claude Documentation](https://docs.anthropic.com/claude)
- [MCP Server Development Guide](https://github.com/modelcontextprotocol/servers)

---

## 🤝 Contributing

 Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🆘 Support

- 📖 [Documentation](https://github.com/sitp2k/easypanel-mcp/wiki)
- 🐛 [Issue Tracker](https://github.com/sitp2k/easypanel-mcp/issues)
- 💬 [Discussions](https://github.com/sitp2k/easypanel-mcp/discussions)
- 🚀 [EasyPanel Support](https://easypanel.io?aff=7GNAmD) (for hosting questions)

---

## 🎉 Acknowledgments

- [EasyPanel](https://easypanel.io?aff=7GNAmD) for providing the amazing hosting platform and sponsoring this project
- [Anthropic](https://anthropic.com) for creating Claude and the Model Context Protocol
- All contributors who help make this project better
- **You**, for supporting open-source development!

---

<p align="center">
  Made with ❤️ by the MCP EasyPanel Server team
</p>