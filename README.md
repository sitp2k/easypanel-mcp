# MCP EasyPanel Server

[![npm version](https://badge.fury.io/js/easypanel-mcp.svg)](https://www.npmjs.com/package/easypanel-mcp)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![GitHub stars](https://img.shields.io/github/stars/sitp2k/easypanel-mcp?style=social)](https://github.com/sitp2k/easypanel-mcp)

> 🚀 **SPONSORED BY EASYPANEL** - Get 20% off + exclusive bonuses through our link
>
> 💎 **Model Context Protocol (MCP) server for managing [EasyPanel](https://easypanel.io?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization) deployments directly from Claude**
>
> ⭐ **Star on GitHub** ⬆️ | [**🎯 Upgrade to Premium & Unlock Full Power**](https://easypanel.io?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization)

---

## 💎 Free vs Premium - Why Premium is a Game-Changer

| Feature | Free Version | 🏆 Premium Version |
|---------|-------------|-------------------|
| **Projects** | ⚠️ Limited (3 projects) | ✅ **Unlimited Projects** |
| **Services** | ⚠️ Limited (5 services) | ✅ **Unlimited Services** |
| **SSL Certificates** | ⚠️ Manual setup | ✅ **Free Auto SSL with Let's Encrypt** |
| **Deployments** | ⚠️ Queue delays | ✅ **Priority Deployments** |
| **Monitoring** | ⚠️ Basic metrics | ✅ **Advanced Monitoring & Alerts** |
| **Support** | ⚠️ Community only | ✅ **Priority Support (24h response)** |
| **Custom Domains** | ⚠️ 1 domain only | ✅ **Unlimited Custom Domains** |
| **Database Backups** | ⚠️ Manual only | ✅ **Automated Daily Backups** |
| **Security** | ⚠️ Basic protection | ✅ **Advanced Firewall & DDoS Protection** |

### 🔥 **Limited Time Offer - Upgrade Now & Save 20%**

[**🚀 Click Here to Upgrade to EasyPanel Premium (20% OFF)**](https://easypanel.io?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization)

*When you upgrade through our link, you not only save 20% but also support continued development of this open-source MCP server!*

---

## 🎯 Why Choose EasyPanel Premium?

### 📈 **Scale Without Limits**
- **Unlimited Projects** - Deploy all your apps without constraints
- **Unlimited Services** - Run as many microservices, databases, and apps as you need
- **Unlimited Domains** - Host multiple projects with custom domains

### 🛡️ **Enterprise Security**
- **Free SSL Certificates** - Automatic HTTPS for all your domains
- **Advanced Firewall** - Protect against attacks and DDoS
- **Automated Backups** - Daily backups with one-click restore

### ⚡ **Performance & Support**
- **Priority Build Queues** - Deploy 10x faster with priority access
- **Advanced Monitoring** - Real-time alerts and detailed analytics
- **24/7 Priority Support** - Get help when you need it most

> 💡 **Pro Tip**: Most teams upgrade within 30 days once they see the productivity gains. Start with Premium and scale from day one!

[**🎁 Get Premium Now - Support Open Source Development**](https://easypanel.io?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization)

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

> ⚠️ **Note**: This MCP server works with both Free and Premium [EasyPanel](https://easypanel.io?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization). Upgrade to Premium to unlock advanced features!

---

## 🎯 Quick Start

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

## ✨ Premium Features You'll Love

### 🏗️ **Project Management**
- Create, list, inspect, and delete projects
- Real-time project status tracking
- Service orchestration within projects
- **Premium**: Unlimited projects and services

### 🐳 **Application Services**
- Deploy from Docker images, Git repositories, or Dockerfiles
- Start, stop, restart, and redeploy services
- Update environment variables and resource limits
- Build logs access and monitoring
- **Premium**: Priority deployments and advanced scaling

### 🗄️ **Database Services**
- Create and manage Redis, MySQL, and PostgreSQL instances
- Automatic connection string generation
- Database credentials management
- **Premium**: Automated daily backups and one-click restore

### 🌐 **Domain & SSL Management**
- Add/remove custom domains
- **Premium**: Automatic HTTPS with Let's Encrypt
- **Premium**: Free SSL certificates for all domains
- Custom SSL certificate upload
- Certificate renewal management
- Domain validation and DNS setup
- **Premium**: Unlimited domains (vs 1 on free)

### 📊 **Monitoring & Logs**
- Real-time service statistics (CPU, memory, network)
- Container logs streaming and search
- Performance metrics tracking
- Log filtering and analysis
- **Premium**: Advanced monitoring with alerts and notifications

### 🔐 **Enterprise Security**
- JWT token-based authentication
- Secure credential management
- Session persistence
- Error handling with retry logic
- **Premium**: Advanced firewall and DDoS protection
- **Premium**: Security audit logs and compliance
- 🔒 **CVE-2025-55152 Secure** - Built with pure Node.js/TypeScript, no React dependencies

---

## 🛡️ Security Notice

### 🔒 **CVE-2025-55152 Safe Zone**
This MCP EasyPanel Server is **100% immune** to the Critical React Server Components vulnerability (CVE-2025-55152, CVSS 10.0).

#### Why We're Bulletproof:
- ✅ **Zero React Dependencies** - Pure Node.js/TypeScript architecture
- ✅ **No Server Components** - MCP Protocol, not React RSC
- ✅ **Minimal Attack Surface** - Only 3 core dependencies (`@modelcontextprotocol/sdk`, `axios`, `zod`)
- ✅ **Server-Side Only** - No frontend attack vectors

#### While Others Panic, You're Safe:
- 🚨 React apps worldwide are rushing to patch CVE-2025-55152
- 🛡️ Your MCP EasyPanel Server was never at risk
- 😌 Sleep well knowing your hosting management is secure

> **Peace of Mind Included**: Focus on deploying great apps, not patching vulnerabilities.

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

### 🌐 Domain & SSL Management (Premium Features)

| Tool | Description | Example |
|------|-------------|---------|
| `add_domain` | Add custom domain to service | "Add example.com to service 'web'" |
| `remove_domain` | Remove domain from service | "Remove domain with ID '123'" |
| `list_domains` | List all domains for service | "Show all domains for service 'web'" |
| `validate_domain` | Validate domain and DNS | "Validate domain setup for example.com" |
| `enable_https` | Enable HTTPS with Let's Encrypt | "Enable HTTPS for example.com" |
| `disable_https` | Disable HTTPS for domain | "Disable HTTPS for example.com" |
| `renew_certificate` | Renew SSL certificate | "Renew SSL certificate for domain" |
| `get_certificate` | Get SSL certificate details | "Show SSL certificate info" |
| `upload_custom_certificate` | Upload custom SSL cert | "Upload custom certificate" |

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
- An [EasyPanel](https://easypanel.io?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization) instance (free tier works perfectly!)

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

- [EasyPanel Documentation](https://easypanel.io/docs?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization)
- [EasyPanel Pricing & Plans](https://easypanel.io/pricing?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization)
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

## 🌟 Don't Forget to Star Us!

⭐ **If this MCP server helps you deploy faster, please give us a star on GitHub!** ⭐

[Star on GitHub](https://github.com/sitp2k/easypanel-mcp)

Every star helps us reach more developers and continue maintaining this project.

---

## 💎 Ready to Upgrade to Premium?

You've seen how powerful this MCP server is. Imagine what you can do with:

✅ **Unlimited Projects & Services**
✅ **Free SSL Certificates for All Domains**
✅ **Priority Deployments (10x Faster)**
✅ **Advanced Monitoring & Alerts**
✅ **Automated Daily Backups**
✅ **24/7 Priority Support**
✅ **Advanced Security Features**

### 🔥 **Special Offer - Limited Time!**

🎁 **20% OFF + Exclusive Bonuses**
When you upgrade through our special link:

[**🚀 Upgrade Now & Unlock Premium Features**](https://easypanel.io?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization)

> 💡 **Why wait?** Most teams see 10x productivity increase after switching to Premium. Upgrade now and scale unlimited!

---

## 🆘 Support

- 📖 [Documentation](https://github.com/sitp2k/easypanel-mcp/wiki)
- 🐛 [Issue Tracker](https://github.com/sitp2k/easypanel-mcp/issues)
- 💬 [Discussions](https://github.com/sitp2k/easypanel-mcp/discussions)
- 🚀 [EasyPanel Support](https://easypanel.io?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization) (for hosting questions)
- 💎 [Premium Support for Premium Users](https://easypanel.io?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization)

---

## 🎉 Acknowledgments

- [EasyPanel](https://easypanel.io?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization) for providing the amazing hosting platform and sponsoring this project
- [Anthropic](https://anthropic.com) for creating Claude and the Model Context Protocol
- All contributors who help make this project better
- **You**, for supporting open-source development!

---

<p align="center">
  <strong>⭐ Star on GitHub | <a href="https://easypanel.io?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization">🎯 Upgrade to Premium</a> | ❤️ Support Open Source ⭐</strong>
</p>

---

<p align="center">
  Made with ❤️ by the MCP EasyPanel Server team<br>
  <em>Proudly sponsored by <a href="https://easypanel.io?aff=7GNAmD&utm_source=github&utm_medium=readme&utm_campaign=readme-optimization">EasyPanel</a></em>
</p>