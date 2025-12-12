#!/usr/bin/env node
/**
 * HTTP/SSS Transport for EasyPanel MCP Server
 * Provides both streaming SSE and regular HTTP transport options
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, JSONRPCMessage, McpError } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { registerProgressCallback, unregisterProgressCallback, ProgressUpdate } from './utils/progress.js';
import ClientDetector from './client-detection.js';

interface ConnectionInfo {
  id: string;
  transport: StreamableHTTPServerTransport;
  lastActivity: Date;
  res?: Response;
  isStreaming?: boolean;
}

interface StreamingProgress {
  toolName: string;
  progress: number;
  message: string;
  data?: any;
  timestamp: Date;
}

export class HttpTransportServer {
  private app: express.Application;
  private mcpServer: Server;
  private connections = new Map<string, ConnectionInfo>();
  private streamingSessions = new Map<string, StreamingProgress[]>();
  private port: number;
  private isShuttingDown = false;
  private clientDetector: ClientDetector;

  constructor(mcpServer: Server, port = 3001) {
    this.mcpServer = mcpServer;
    this.port = port;
    this.app = express();
    this.clientDetector = ClientDetector.getInstance();
    this.setupMiddleware();
    this.setupRoutes();
    this.startCleanupTimer();
  }

  private setupMiddleware() {
    // CORS configuration
    this.app.use(cors({
      origin: process.env.SSE_CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      credentials: true
    }));

    // JSON parsing with limit
    this.app.use(express.json({ limit: '10mb' }));

    // Request logging with client detection
    this.app.use((req, res, next) => {
      const client = this.clientDetector.detectClient(req);
      console.error(`[HTTP] ${req.method} ${req.path} - Client: ${client.name} (${client.type}) - ${new Date().toISOString()}`);
      (req as any)._clientInfo = client;
      next();
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connections: this.connections.size,
        uptime: process.uptime()
      });
    });
  }

  private setupRoutes() {
    // Main MCP endpoint
    this.app.all('/mcp', this.handleMcpRequest.bind(this));

    // Progress streaming endpoint
    this.app.get('/progress/:sessionId', this.handleProgressStream.bind(this));

    // Connection info endpoint
    this.app.get('/connections', (req, res) => {
      const connections = Array.from(this.connections.values()).map(c => ({
        id: c.id,
        lastActivity: c.lastActivity,
        isStreaming: c.isStreaming
      }));
      res.json({ connections, count: connections.length });
    });

    // Static file serving for dashboard (optional)
    this.app.use('/dashboard', express.static('public'));

    // Error handling
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('[HTTP] Error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: err.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  private async handleMcpRequest(req: Request, res: Response) {
    try {
      // Detect client
      const client = (req as any)._clientInfo;

      // Create transport for this request
      const sessionId = req.headers['x-mcp-session-id'] as string || randomUUID();

      let connection = this.connections.get(sessionId);

      if (!connection) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId,
          onsessioninitialized: async (sid) => {
            console.error(`[HTTP] Session initialized: ${sid} for ${client.name}`);
          },
          onsessionclosed: async (sid) => {
            console.error(`[HTTP] Session closed: ${sid}`);
            this.connections.delete(sid);
            this.streamingSessions.delete(sid);
          },
          enableJsonResponse: req.headers.accept !== 'text/event-stream',
          retryInterval: 2000
        });

        // Setup transport event handlers
        transport.onclose = () => {
          this.connections.delete(sessionId);
          unregisterProgressCallback(sessionId);
        };

        transport.onerror = (error) => {
          console.error(`[HTTP] Transport error for session ${sessionId}:`, error);
          this.connections.delete(sessionId);
          unregisterProgressCallback(sessionId);
        };

        // Connect to MCP server
        await this.mcpServer.connect(transport);

        connection = {
          id: sessionId,
          transport,
          lastActivity: new Date(),
          res,
          isStreaming: req.headers.accept === 'text/event-stream'
        };

        this.connections.set(sessionId, connection);

        // Register progress callback for this session
        registerProgressCallback(sessionId, (update: ProgressUpdate) => {
          this.updateProgress(sessionId, update);
        });
      }

      // Update last activity
      connection.lastActivity = new Date();
      connection.res = res;

      // Add sessionId and client info to request metadata for progress tracking
      (req as any)._sessionId = sessionId;
      (req as any)._meta = {
        sessionId,
        transportRequest: req,
        client
      };

      // Handle the request
      await connection.transport.handleRequest(req, res, req.body);

      // For streaming connections, set up progress tracking
      if (req.headers.accept === 'text/event-stream') {
        connection.isStreaming = true;
      }

    } catch (error) {
      console.error('[HTTP] MCP Request failed:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'MCP Request Failed',
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  private async handleProgressStream(req: Request, res: Response) {
    const sessionId = req.params.sessionId;

    if (!this.connections.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      sessionId,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Keep connection alive and send progress updates
    const interval = setInterval(() => {
      const progress = this.streamingSessions.get(sessionId) || [];

      // Send latest progress if any
      if (progress.length > 0) {
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          progress: progress[progress.length - 1],
          timestamp: new Date().toISOString()
        })}\n\n`);
      }

      // Send heartbeat
      res.write(`: ${new Date().toISOString()}\n\n`);
    }, 1000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(interval);
    });
  }


  private updateProgress(sessionId: string, progress: ProgressUpdate) {
    const sessionProgress = this.streamingSessions.get(sessionId);
    if (sessionProgress) {
      sessionProgress.push(progress as StreamingProgress);
      console.error(`[Progress] ${sessionId}: ${progress.toolName} - ${progress.progress}% - ${progress.message}`);
    }
  }

  private startCleanupTimer() {
    // Cleanup inactive connections every 30 seconds
    setInterval(() => {
      const now = new Date();
      const timeout = 5 * 60 * 1000; // 5 minutes

      for (const [id, connection] of this.connections.entries()) {
        if (now.getTime() - connection.lastActivity.getTime() > timeout) {
          console.error(`[HTTP] Cleaning up inactive connection: ${id}`);
          connection.transport.close();
          this.connections.delete(id);
          this.streamingSessions.delete(id);
          unregisterProgressCallback(id);
        }
      }
    }, 30000);
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      const server = this.app.listen(this.port, () => {
        console.error(`[HTTP] MCP Server running on port ${this.port}`);
        console.error(`[HTTP] SSE endpoint: http://localhost:${this.port}/progress/{sessionId}`);
        console.error(`[HTTP] Health check: http://localhost:${this.port}/health`);
        resolve();
      });

      // Graceful shutdown
      process.on('SIGTERM', this.shutdown.bind(this));
      process.on('SIGINT', this.shutdown.bind(this));
      process.on('SIGUSR2', this.shutdown.bind(this)); // Nodemon

      // Handle server errors
      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`[HTTP] Port ${this.port} is already in use`);
        } else {
          console.error('[HTTP] Server error:', error);
        }
        process.exit(1);
      });
    });
  }

  private async shutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.error('[HTTP] Shutting down HTTP server...');

    // Close all connections
    const closePromises = Array.from(this.connections.values()).map(c =>
      c.transport.close().catch(err =>
        console.error(`[HTTP] Error closing connection ${c.id}:`, err)
      )
    );

    await Promise.all(closePromises);

    // Close MCP server
    await this.mcpServer.close();

    console.error('[HTTP] Server shutdown complete');
    process.exit(0);
  }

  // Public method to send real-time notifications
  sendNotification(sessionId: string, notification: any) {
    const progress = this.streamingSessions.get(sessionId);
    if (progress) {
      this.updateProgress(sessionId, {
        toolName: 'notification',
        progress: 0,
        message: 'Real-time notification',
        data: notification,
        timestamp: new Date()
      });
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.connections.keys());
  }
}

export default HttpTransportServer;