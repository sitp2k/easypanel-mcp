#!/usr/bin/env node
/**
 * REST API Endpoints for Web-based IDE Integration
 * Provides HTTP endpoints for all MCP tools
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, JSONRPCMessage, McpError } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import ClientDetector, { ClientType, ClientInfo } from './client-detection.js';

import { projectTools, handleProjectTool } from './tools/projects.js';
import { serviceTools, handleServiceTool } from './tools/services.js';
import { databaseTools, handleDatabaseTool } from './tools/databases.js';
import { domainTools, handleDomainTool } from './tools/domains.js';
import { licenseTools, handleLicenseTool } from './tools/license.js';
import { monitoringTools, handleMonitoringTool } from './tools/monitoring.js';
import { dockerTools, handleDockerCleanupImages, handleDockerPruneBuilderCache } from './tools/docker.js';
import { systemTools, handleSystemTool } from './tools/system.js';

interface RestApiResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    clientId: string;
    clientType: ClientType;
    timestamp: string;
    executionTime?: number;
  };
}

export class RestApiServer {
  private app: express.Application;
  private mcpServer: Server;
  private port: number;
  private clientDetector: ClientDetector;

  constructor(mcpServer: Server, port = 3002) {
    this.mcpServer = mcpServer;
    this.port = port;
    this.app = express();
    this.clientDetector = ClientDetector.getInstance();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    // Enhanced CORS configuration for web IDEs
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow any origin for web IDEs
        callback(null, true);
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-MCP-Session-ID',
        'X-Client-Name',
        'X-Client-Version',
        'X-Requested-With'
      ],
      credentials: true,
      preflightContinue: false,
      optionsSuccessStatus: 204
    }));

    // JSON parsing with support for various content types
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Request logging with client detection
    this.app.use((req, res, next) => {
      const client = this.clientDetector.detectClient(req);
      const startTime = Date.now();

      console.error(`[REST API] ${req.method} ${req.path} - Client: ${client.name} (${client.type})`);

      // Attach client info to request
      (req as any)._clientInfo = client;
      (req as any)._startTime = startTime;

      next();
    });

    // Rate limiting for web IDEs
    const requestCounts = new Map<string, { count: number; resetTime: number }>();
    this.app.use((req, res, next) => {
      const client = (req as any)._clientInfo as ClientInfo;
      const clientId = req.headers['x-mcp-session-id'] as string || req.ip || 'unknown';

      let clientData = requestCounts.get(clientId);
      const now = Date.now();

      if (!clientData || now > clientData.resetTime) {
        clientData = { count: 1, resetTime: now + 60000 }; // 1 minute window
        requestCounts.set(clientId, clientData);
      } else {
        clientData.count++;

        // Different limits for different clients
        const limits = {
          [ClientType.WEB_IDE]: 100,
          [ClientType.CURSOR]: 200,
          [ClientType.WINDSURF]: 200,
          [ClientType.KIRO]: 150,
          [ClientType.CLAUDE]: 300,
          [ClientType.GENERIC]: 100,
          [ClientType.UNKNOWN]: 50
        };

        const limit = limits[client.type] || 100;

        if (clientData.count > limit) {
          return res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: `Rate limit exceeded. Maximum ${limit} requests per minute.`
            }
          });
        }
      }

      next();
    });
  }

  private setupRoutes() {
    // API Router
    const apiRouter = express.Router();

    // Health check endpoint
    apiRouter.get('/health', (req, res) => {
      const client = (req as any)._clientInfo as ClientInfo;
      res.json({
        success: true,
        data: {
          status: 'healthy',
          version: '1.0.1',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          detectedClient: client.name,
          supportedClients: Object.values(ClientType).filter(t => t !== ClientType.UNKNOWN)
        }
      });
    });

    // Server status endpoint
    apiRouter.get('/status', (req, res) => {
      const client = (req as any)._clientInfo as ClientInfo;
      res.json({
        success: true,
        data: {
          server: {
            name: 'MCP EasyPanel Server',
            version: '1.0.1',
            nodeVersion: process.version,
            platform: process.platform
          },
          capabilities: {
            streaming: client.capabilities.streaming,
            progress: client.capabilities.progress,
            sse: client.capabilities.sse,
            restApi: client.capabilities.restApi,
            richFormatting: client.capabilities.richFormatting,
            fileOperations: client.capabilities.fileOperations
          },
          endpoints: {
            tools: '/api/tools',
            execute: '/api/tools/:toolName',
            health: '/api/health',
            status: '/api/status'
          }
        }
      });
    });

    // List all available tools
    apiRouter.get('/tools', (req, res) => {
      const client = (req as any)._clientInfo as ClientInfo;
      const startTime = (req as any)._startTime as number;

      try {
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

        // Filter tools based on client capabilities
        const filteredTools = this.filterToolsForClient(allTools, client);

        const response: RestApiResponse = {
          success: true,
          data: {
            tools: filteredTools,
            count: filteredTools.length,
            clientType: client.type,
            clientCapabilities: client.capabilities
          },
          meta: {
            clientId: req.headers['x-mcp-session-id'] as string || 'anonymous',
            clientType: client.type,
            timestamp: new Date().toISOString(),
            executionTime: Date.now() - startTime
          }
        };

        res.json(this.clientDetector.adaptResponse(response, client));
      } catch (error) {
        this.handleError(res, error, client, startTime);
      }
    });

    // Get specific tool information
    apiRouter.get('/tools/:toolName', (req, res) => {
      const client = (req as any)._clientInfo as ClientInfo;
      const startTime = (req as any)._startTime as number;
      const toolName = req.params.toolName;

      try {
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

        const tool = allTools.find(t => t.name === toolName);

        if (!tool) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'TOOL_NOT_FOUND',
              message: `Tool '${toolName}' not found`
            }
          });
        }

        const response: RestApiResponse = {
          success: true,
          data: {
            tool,
            clientCompatibility: this.getToolCompatibility(tool, client)
          },
          meta: {
            clientId: req.headers['x-mcp-session-id'] as string || 'anonymous',
            clientType: client.type,
            timestamp: new Date().toISOString(),
            executionTime: Date.now() - startTime
          }
        };

        res.json(this.clientDetector.adaptResponse(response, client));
      } catch (error) {
        this.handleError(res, error, client, startTime);
      }
    });

    // Execute a tool
    apiRouter.post('/tools/:toolName', async (req, res) => {
      const client = (req as any)._clientInfo as ClientInfo;
      const startTime = (req as any)._startTime as number;
      const toolName = req.params.toolName;
      const args = req.body || {};

      try {
        // Check if tool is compatible with client
        if (!this.isToolCompatible(toolName, client)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'TOOL_INCOMPATIBLE',
              message: `Tool '${toolName}' is not compatible with ${client.name}`,
              details: {
                toolName,
                clientType: client.type,
                requiredCapabilities: this.getRequiredCapabilities(toolName)
              }
            }
          });
        }

        // Execute the tool
        const result = await this.executeTool(toolName, args);

        const response: RestApiResponse = {
          success: true,
          data: result,
          meta: {
            clientId: req.headers['x-mcp-session-id'] as string || 'anonymous',
            clientType: client.type,
            timestamp: new Date().toISOString(),
            executionTime: Date.now() - startTime
          }
        };

        res.json(this.clientDetector.adaptResponse(response, client));
      } catch (error) {
        this.handleError(res, error, client, startTime);
      }
    });

    // Batch execute multiple tools
    apiRouter.post('/tools/batch', async (req, res) => {
      const client = (req as any)._clientInfo as ClientInfo;
      const startTime = (req as any)._startTime as number;
      const { tools } = req.body || {};

      if (!Array.isArray(tools)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Request body must contain a "tools" array'
          }
        });
      }

      try {
        const results = await Promise.all(
          tools.map(async ({ name, args }: { name: string; args?: any }) => {
            if (!this.isToolCompatible(name, client)) {
              return {
                name,
                success: false,
                error: `Tool '${name}' is not compatible with ${client.name}`
              };
            }

            try {
              const result = await this.executeTool(name, args || {});
              return {
                name,
                success: true,
                result
              };
            } catch (error) {
              return {
                name,
                success: false,
                error: error instanceof Error ? error.message : String(error)
              };
            }
          })
        );

        const response: RestApiResponse = {
          success: true,
          data: {
            results,
            summary: {
              total: results.length,
              successful: results.filter(r => r.success).length,
              failed: results.filter(r => !r.success).length
            }
          },
          meta: {
            clientId: req.headers['x-mcp-session-id'] as string || 'anonymous',
            clientType: client.type,
            timestamp: new Date().toISOString(),
            executionTime: Date.now() - startTime
          }
        };

        res.json(this.clientDetector.adaptResponse(response, client));
      } catch (error) {
        this.handleError(res, error, client, startTime);
      }
    });

    // Client information endpoint
    apiRouter.get('/client', (req, res) => {
      const client = (req as any)._clientInfo as ClientInfo;
      const startTime = (req as any)._startTime as number;

      const response: RestApiResponse = {
        success: true,
        data: {
          client: {
            type: client.type,
            name: client.name,
            capabilities: client.capabilities,
            compatibility: client.compatibility
          },
          config: this.clientDetector.getClientConfig(client)
        },
        meta: {
          clientId: req.headers['x-mcp-session-id'] as string || 'anonymous',
          clientType: client.type,
          timestamp: new Date().toISOString(),
          executionTime: Date.now() - startTime
        }
      };

      res.json(this.clientDetector.adaptResponse(response, client));
    });

    // Setup documentation endpoint
    apiRouter.get('/docs', (req, res) => {
      const client = (req as any)._clientInfo as ClientInfo;

      res.json({
        success: true,
        data: {
          title: 'MCP EasyPanel Server REST API',
          version: '1.0.1',
          description: 'REST API for managing EasyPanel projects, services, and deployments',
          endpoints: [
            {
              path: '/api/health',
              method: 'GET',
              description: 'Check server health'
            },
            {
              path: '/api/status',
              method: 'GET',
              description: 'Get server status and capabilities'
            },
            {
              path: '/api/tools',
              method: 'GET',
              description: 'List all available tools'
            },
            {
              path: '/api/tools/{toolName}',
              method: 'GET',
              description: 'Get specific tool information'
            },
            {
              path: '/api/tools/{toolName}',
              method: 'POST',
              description: 'Execute a tool'
            },
            {
              path: '/api/tools/batch',
              method: 'POST',
              description: 'Execute multiple tools'
            },
            {
              path: '/api/client',
              method: 'GET',
              description: 'Get detected client information'
            }
          ],
          examples: {
            'List tools': 'GET /api/tools',
            'Execute tool': 'POST /api/projects_list\n\n{\n  "limit": 10\n}',
            'Batch execute': 'POST /api/tools/batch\n\n{\n  "tools": [\n    {"name": "projects_list"},\n    {"name": "services_list", "args": {"limit": 5}}\n  ]\n}'
          },
          supportedClients: [
            {
              name: 'Cursor',
              description: 'Full support with streaming and progress',
              setup: 'Use stdio or SSE endpoint'
            },
            {
              name: 'Windsurf',
              description: 'Full support with enhanced error messages',
              setup: 'Use stdio or SSE endpoint'
            },
            {
              name: 'Kiro',
              description: 'Support via REST API (synchronous mode)',
              setup: 'Use REST API endpoints'
            },
            {
              name: 'Web IDEs',
              description: 'Full REST API support with CORS',
              setup: 'Use REST API endpoints'
            },
            {
              name: 'Claude',
              description: 'Native MCP support via stdio/SSE',
              setup: 'Use MCP protocol directly'
            }
          ]
        }
      });
    });

    // Mount API router
    this.app.use('/api', apiRouter);

    // Root endpoint redirects to docs
    this.app.get('/', (req, res) => {
      res.redirect('/api/docs');
    });

    // Error handling middleware
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('[REST API] Error:', err);
      const client = (req as any)._clientInfo as ClientInfo;
      const startTime = (req as any)._startTime as number;

      if (!res.headersSent) {
        this.handleError(res, err, client, startTime);
      }
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Endpoint ${req.method} ${req.path} not found`,
          hint: 'Check /api/docs for available endpoints'
        }
      });
    });
  }

  private filterToolsForClient(tools: any[], client: ClientInfo): any[] {
    return tools.filter(tool => this.isToolCompatible(tool.name, client));
  }

  private isToolCompatible(toolName: string, client: ClientInfo): boolean {
    // All tools are compatible by default, but we can add client-specific restrictions here
    if (client.type === ClientType.KIRO && toolName.includes('stream')) {
      return false;
    }
    if (client.type === ClientType.WEB_IDE && toolName.includes('file')) {
      return false;
    }
    return true;
  }

  private getRequiredCapabilities(toolName: string): string[] {
    const capabilities: string[] = [];
    if (toolName.includes('stream')) capabilities.push('streaming');
    if (toolName.includes('progress')) capabilities.push('progress');
    if (toolName.includes('file')) capabilities.push('fileOperations');
    return capabilities;
  }

  private getToolCompatibility(tool: any, client: ClientInfo): any {
    const required = this.getRequiredCapabilities(tool.name);
    const supported = required.filter(cap => (client.capabilities as any)[cap]);

    return {
      compatible: required.length === supported.length,
      requiredCapabilities: required,
      supportedCapabilities: supported,
      missingCapabilities: required.filter(cap => !supported.includes(cap)),
      notes: this.getCompatibilityNotes(tool.name, client)
    };
  }

  private getCompatibilityNotes(toolName: string, client: ClientInfo): string[] {
    const notes: string[] = [];

    if (client.type === ClientType.KIRO && toolName.includes('stream')) {
      notes.push('Streaming not supported in Kiro, will use synchronous mode');
    }
    if (client.type === ClientType.CURSOR && !client.capabilities.sessionId) {
      notes.push('Stateless connections - results may not persist');
    }
    if (client.type === ClientType.WEB_IDE) {
      notes.push('CORS headers applied automatically');
    }

    return notes;
  }

  private async executeTool(toolName: string, args: any): Promise<any> {
    try {
      // Project tools
      if (toolName in projectTools) {
        return await handleProjectTool(toolName, args);
      }

      // Service tools
      if (toolName in serviceTools) {
        return await handleServiceTool(toolName, args);
      }

      // Database tools
      if (toolName in databaseTools) {
        return await handleDatabaseTool(toolName, args);
      }

      // Domain tools
      if (toolName in domainTools) {
        return await handleDomainTool(toolName, args);
      }

      // License tools
      if (toolName in licenseTools) {
        return await handleLicenseTool(toolName, args);
      }

      // Monitoring tools
      if (toolName in monitoringTools) {
        return await handleMonitoringTool(toolName, args);
      }

      // Docker tools
      if (toolName in dockerTools) {
        switch (toolName) {
          case 'docker_cleanup_images':
            return await handleDockerCleanupImages(args || {});
          case 'docker_prune_builder_cache':
            return await handleDockerPruneBuilderCache(args || {});
        }
      }

      // System tools
      if (toolName in systemTools) {
        return await handleSystemTool(toolName, args);
      }

      throw new Error(`Unknown tool: ${toolName}`);
    } catch (error) {
      if (error instanceof McpError) {
        throw new Error(error.message);
      }
      throw error;
    }
  }

  private handleError(res: Response, error: any, client: ClientInfo, startTime: number): void {
    const response: RestApiResponse = {
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
        details: error.details || undefined
      },
      meta: {
        clientId: 'unknown',
        clientType: client.type,
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startTime
      }
    };

    const statusCode = error.statusCode || error.code === 'TOOL_NOT_FOUND' ? 404 : 500;

    res.status(statusCode).json(
      this.clientDetector.adaptResponse(response, client)
    );
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      const server = this.app.listen(this.port, () => {
        console.error(`[REST API] Server running on port ${this.port}`);
        console.error(`[REST API] API base URL: http://localhost:${this.port}/api`);
        console.error(`[REST API] API docs: http://localhost:${this.port}/api/docs`);
        console.error(`[REST API] Health check: http://localhost:${this.port}/api/health`);
        resolve();
      });

      // Handle server errors
      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`[REST API] Port ${this.port} is already in use`);
        } else {
          console.error('[REST API] Server error:', error);
        }
        process.exit(1);
      });

      // Graceful shutdown
      process.on('SIGTERM', () => {
        console.error('[REST API] Shutting down...');
        server.close(() => {
          console.error('[REST API] Server shutdown complete');
          process.exit(0);
        });
      });
    });
  }
}

export default RestApiServer;