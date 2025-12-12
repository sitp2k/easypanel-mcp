#!/usr/bin/env node
/**
 * MCP Server for EasyPanel
 * Manage projects, services, deployments, and databases via Claude
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

import { projectTools, handleProjectTool } from './tools/projects.js';
import { serviceTools, handleServiceTool } from './tools/services.js';
import { databaseTools, handleDatabaseTool } from './tools/databases.js';
import { domainTools, handleDomainTool } from './tools/domains.js';
import { licenseTools, handleLicenseTool } from './tools/license.js';
import { monitoringTools, handleMonitoringTool } from './tools/monitoring.js';

class EasyPanelMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-easypanel-server',
        version: '1.0.0',
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
      await this.server.close();
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
      ];

      return { tools: allTools };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.error(`[MCP] Executing tool: ${name}`);

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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MCP] EasyPanel MCP Server running on stdio');
  }
}

// Main entry point
const server = new EasyPanelMCPServer();
server.run().catch((error) => {
  console.error('[Fatal]', error);
  process.exit(1);
});
