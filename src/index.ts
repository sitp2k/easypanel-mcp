#!/usr/bin/env node
/**
 * MCP Server for EasyPanel
 * Multi-client support for Claude, Cursor, Windsurf, Kiro, and Web IDEs
 * Supports stdio, HTTP/SSE, and REST API transports
 */

import { program } from 'commander';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

import HttpTransportServer from './http-transport.js';
import RestApiServer from './rest-api.js';
import ClientDetector, { ClientType, ClientInfo } from './client-detection.js';

import { projectTools, handleProjectTool } from './tools/projects.js';
import { serviceTools, handleServiceTool } from './tools/services.js';
import { databaseTools, handleDatabaseTool } from './tools/databases.js';
import { domainTools, handleDomainTool } from './tools/domains.js';
import { licenseTools, handleLicenseTool } from './tools/license.js';
import { monitoringTools, handleMonitoringTool } from './tools/monitoring.js';
import { dockerTools, handleDockerCleanupImages, handleDockerPruneBuilderCache } from './tools/docker.js';
import { systemTools, handleSystemTool } from './tools/system.js';

class EasyPanelMCPServer {
  private server: Server;
  private httpServer?: HttpTransportServer;
  private restApiServer?: RestApiServer;
  private clientDetector: ClientDetector;

  constructor() {
    this.clientDetector = ClientDetector.getInstance();
    this.server = new Server(
      {
        name: 'mcp-easypanel-server',
        version: '1.0.1',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.shutdown();
      process.exit(0);
    });
  }

  private setupHandlers() {
    // List all available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const allTools = [
        ...Object.values(projectTools),
        ...Object.values(serviceTools),
        ...Object.values(databaseTools),
        ...Object.values(domainTools),
        ...Object.values(licenseTools),
        ...Object.values(monitoringTools),
        ...Object.values(dockerTools),
        ...Object.values(systemTools),
      ];

      return { tools: allTools };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Extract sessionId from request metadata (passed by HTTP transport)
      const sessionId = (request as any)._meta?.sessionId ||
                        (request as any)._sessionId ||
                        undefined;

      // Detect client if transport metadata is available
      let client: ClientInfo | undefined;
      if ((request as any)._meta?.transportRequest) {
        client = this.clientDetector.detectClient((request as any)._meta.transportRequest);
      }

      const clientName = client ? client.name : 'Unknown';
      console.error(`[MCP] Executing tool: ${name}${sessionId ? ` (session: ${sessionId})` : ''} for ${clientName}`);

      try {
        // Project tools
        if (name in projectTools) {
          return await handleProjectTool(name, args);
        }

        // Service tools
        if (name in serviceTools) {
          return await handleServiceTool(name, args);
        }

        // Database tools
        if (name in databaseTools) {
          return await handleDatabaseTool(name, args);
        }

        // Domain tools
        if (name in domainTools) {
          return await handleDomainTool(name, args);
        }

        // License tools
        if (name in licenseTools) {
          return await handleLicenseTool(name, args);
        }

        // Monitoring tools
        if (name in monitoringTools) {
          return await handleMonitoringTool(name, args);
        }

        // Docker tools
        if (name in dockerTools) {
          switch (name) {
            case 'docker_cleanup_images':
              return await handleDockerCleanupImages(args || {}, sessionId);
            case 'docker_prune_builder_cache':
              return await handleDockerPruneBuilderCache(args || {}, sessionId);
          }
        }

        // System tools
        if (name in systemTools) {
          return await handleSystemTool(name, args);
        }

        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      } catch (error) {
        console.error(`[MCP] Tool execution failed:`, error);

        if (error instanceof McpError) {
          throw error;
        }

        const message = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, message);
      }
    });
  }

  async runStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MCP] EasyPanel MCP Server running on stdio');
  }

  async runHttp(port: number = 3001) {
    this.httpServer = new HttpTransportServer(this.server, port);
    await this.httpServer.start();
  }

  async runRestApi(port: number = 3002) {
    this.restApiServer = new RestApiServer(this.server, port);
    await this.restApiServer.start();
  }

  async runAll(httpPort: number = 3001, restPort: number = 3002) {
    console.error('[MCP] Starting multiple transports...');

    // Start HTTP/SSE transport
    this.httpServer = new HttpTransportServer(this.server, httpPort);

    // Start REST API transport
    this.restApiServer = new RestApiServer(this.server, restPort);

    // Start both in parallel
    await Promise.all([
      this.httpServer.start(),
      this.restApiServer.start()
    ]);
  }

  async run(transport: 'stdio' | 'sse' | 'rest' | 'all' = 'stdio', port?: number, httpPort?: number, restPort?: number) {
    switch (transport) {
      case 'stdio':
        await this.runStdio();
        break;
      case 'sse':
        await this.runHttp(port || 3001);
        break;
      case 'rest':
        await this.runRestApi(port || 3002);
        break;
      case 'all':
        await this.runAll(httpPort || 3001, restPort || 3002);
        break;
      default:
        throw new Error(`Unknown transport type: ${transport}. Use: stdio, sse, rest, or all`);
    }
  }

  private async shutdown() {
    console.error('[MCP] Shutting down EasyPanel MCP Server...');

    // Close HTTP transport if running
    if (this.httpServer) {
      console.error('[MCP] Closing HTTP transport...');
      // Note: HttpTransportServer handles its own shutdown
    }

    // Close REST API if running
    if (this.restApiServer) {
      console.error('[MCP] Closing REST API...');
      // Note: RestApiServer handles its own shutdown
    }

    // Close MCP server
    await this.server.close();

    console.error('[MCP] Shutdown complete');
  }

  // Get supported clients information
  getSupportedClients() {
    return {
      supported: Object.values(ClientType).filter(t => t !== ClientType.UNKNOWN),
      description: {
        [ClientType.CLAUDE]: {
          name: 'Claude',
          transports: ['stdio', 'sse'],
          features: ['streaming', 'progress', 'rich-formatting']
        },
        [ClientType.CURSOR]: {
          name: 'Cursor',
          transports: ['stdio', 'sse', 'rest'],
          features: ['compact-responses', 'stateless-mode']
        },
        [ClientType.WINDSURF]: {
          name: 'Windsurf',
          transports: ['stdio', 'sse', 'rest'],
          features: ['enhanced-errors', 'streaming']
        },
        [ClientType.KIRO]: {
          name: 'Kiro',
          transports: ['rest'],
          features: ['synchronous-mode', 'batch-execution']
        },
        [ClientType.WEB_IDE]: {
          name: 'Web IDE',
          transports: ['rest'],
          features: ['cors-support', 'batch-execution']
        },
        [ClientType.GENERIC]: {
          name: 'Generic MCP Client',
          transports: ['stdio', 'sse', 'rest'],
          features: ['basic-compatibility']
        }
      }
    };
  }
}

// Configure command-line options
program
  .name('easypanel-mcp')
  .description('Multi-client MCP Server for EasyPanel - supports Claude, Cursor, Windsurf, Kiro, and Web IDEs')
  .version('1.0.1')
  .option('-t, --transport <type>', 'Transport type: stdio (default), sse, rest, or all', 'stdio')
  .option('-p, --port <number>', 'Port for SSE/HTTP transport (default: 3001)', '3001')
  .option('-r, --rest-port <number>', 'Port for REST API transport (default: 3002)', '3002')
  .option('-c, --client <type>', 'Force client type (claude, cursor, windsurf, kiro, web, generic)')
  .option('--http-port <number>', 'HTTP port for "all" transport (default: 3001)', '3001')
  .option('--rest-api-port <number>', 'REST API port for "all" transport (default: 3002)', '3002')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--list-clients', 'List all supported AI clients and exit')
  .parse();

const options = program.opts();

// Enable verbose logging if requested
if (options.verbose) {
  process.env.DEBUG = 'true';
  console.error('[MCP] Verbose mode enabled');
}

// Set client type if forced
if (options.client) {
  process.env.MCP_CLIENT = options.client.toLowerCase();
}

// Main entry point
const server = new EasyPanelMCPServer();

// List supported clients and exit if requested
if (options.listClients) {
  const clients = server.getSupportedClients();
  console.error('\nSupported AI Clients:');
  console.error('======================\n');

  clients.supported.forEach(clientType => {
    const info = clients.description[clientType as keyof typeof clients.description];
    if (info) {
      console.error(`${info.name}`);
      console.error(`  Transports: ${info.transports.join(', ')}`);
      console.error(`  Features: ${info.features.join(', ')}`);
      console.error('');
    }
  });

  console.error('\nTransport Options:');
  console.error('- stdio: Standard MCP protocol (Claude, Cursor, Windsurf)');
  console.error('- sse: HTTP with Server-Sent Events (All clients except Kiro)');
  console.error('- rest: REST API (Kiro, Web IDEs, others)');
  console.error('- all: Run all transports simultaneously\n');

  process.exit(0);
}

// Start the server with the specified transport
const transportType = options.transport as 'stdio' | 'sse' | 'rest' | 'all';
const port = parseInt(options.port) || 3001;
const restPort = parseInt(options.restPort) || 3002;
const httpPort = parseInt(options.httpPort) || 3001;
const restApiPort = parseInt(options.restApiPort) || 3002;

console.error(`[MCP] Starting EasyPanel MCP Server with ${transportType} transport`);
console.error(`[MCP] Multi-client support enabled for Claude, Cursor, Windsurf, Kiro, and Web IDEs`);

switch (transportType) {
  case 'stdio':
    console.error(`[MCP] Using stdio transport`);
    break;
  case 'sse':
    console.error(`[MCP] HTTP/SSE port: ${port}`);
    console.error(`[MCP] WebSocket endpoint: http://localhost:${port}/progress/{sessionId}`);
    break;
  case 'rest':
    console.error(`[MCP] REST API port: ${restPort}`);
    console.error(`[MCP] API base URL: http://localhost:${restPort}/api`);
    console.error(`[MCP] API docs: http://localhost:${restPort}/api/docs`);
    break;
  case 'all':
    console.error(`[MCP] HTTP/SSE port: ${httpPort}`);
    console.error(`[MCP] REST API port: ${restApiPort}`);
    console.error(`[MCP] Running all transports simultaneously`);
    break;
}

server.run(transportType, port, httpPort, restApiPort).catch((error) => {
  console.error('[Fatal]', error);
  process.exit(1);
});
