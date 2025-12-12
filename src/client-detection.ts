#!/usr/bin/env node
/**
 * Client Detection and Compatibility Module
 * Identifies different AI IDEs and adapts responses accordingly
 */

export enum ClientType {
  CLAUDE = 'claude',
  CURSOR = 'cursor',
  WINDSURF = 'windsurf',
  KIRO = 'kiro',
  WEB_IDE = 'web_ide',
  GENERIC = 'generic',
  UNKNOWN = 'unknown'
}

export interface ClientInfo {
  type: ClientType;
  name: string;
  version?: string;
  capabilities: {
    streaming: boolean;
    progress: boolean;
    sse: boolean;
    restApi: boolean;
    richFormatting: boolean;
    fileOperations: boolean;
    sessionId: boolean;
  };
  compatibility: {
    needsWorkarounds: string[];
    preferredFormat: 'json' | 'text' | 'markdown';
    responseStructure: 'compact' | 'detailed' | 'nested';
  };
}

export class ClientDetector {
  private static instance: ClientDetector;
  private clientCache = new Map<string, ClientInfo>();

  static getInstance(): ClientDetector {
    if (!ClientDetector.instance) {
      ClientDetector.instance = new ClientDetector();
    }
    return ClientDetector.instance;
  }

  /**
   * Detect client type from headers and request metadata
   */
  detectClient(req: any): ClientInfo {
    const headers = req.headers || {};
    const userAgent = headers['user-agent'] || '';
    const sessionId = headers['x-mcp-session-id'] || headers['session-id'] || '';
    const clientHint = headers['x-client-name'] || headers['client'] || '';

    // Check cache first
    const cacheKey = `${userAgent}-${clientHint}-${sessionId}`;
    if (this.clientCache.has(cacheKey)) {
      return this.clientCache.get(cacheKey)!;
    }

    // Detect client type
    let client: ClientInfo;

    if (this.isClaude(userAgent, clientHint, headers)) {
      client = this.getClaudeInfo();
    } else if (this.isCursor(userAgent, clientHint, headers)) {
      client = this.getCursorInfo();
    } else if (this.isWindsurf(userAgent, clientHint, headers)) {
      client = this.getWindsurfInfo();
    } else if (this.isKiro(userAgent, clientHint, headers)) {
      client = this.getKiroInfo();
    } else if (this.isWebIDE(userAgent, clientHint, headers)) {
      client = this.getWebIDEInfo();
    } else if (this.isGenericMCP(userAgent, clientHint, headers)) {
      client = this.getGenericInfo();
    } else {
      client = this.getUnknownInfo();
    }

    // Cache the result
    this.clientCache.set(cacheKey, client);

    return client;
  }

  private isClaude(userAgent: string, clientHint: string, headers: any): boolean {
    return userAgent.includes('Claude') ||
           clientHint.includes('claude') ||
           headers['x-claude-version'] ||
           headers['anthropic-version'] ||
           process.env.MCP_CLIENT === 'claude';
  }

  private isCursor(userAgent: string, clientHint: string, headers: any): boolean {
    return userAgent.includes('Cursor') ||
           clientHint.includes('cursor') ||
           headers['x-cursor-version'] ||
           headers['x-cursor-agent'] ||
           process.env.MCP_CLIENT === 'cursor';
  }

  private isWindsurf(userAgent: string, clientHint: string, headers: any): boolean {
    return userAgent.includes('Windsurf') ||
           clientHint.includes('windsurf') ||
           headers['x-windsurf-version'] ||
           process.env.MCP_CLIENT === 'windsurf';
  }

  private isKiro(userAgent: string, clientHint: string, headers: any): boolean {
    return userAgent.includes('Kiro') ||
           clientHint.includes('kiro') ||
           headers['x-kiro-version'] ||
           process.env.MCP_CLIENT === 'kiro';
  }

  private isWebIDE(userAgent: string, clientHint: string, headers: any): boolean {
    return userAgent.includes('Mozilla') && !userAgent.includes('Claude') ||
           clientHint.includes('web') ||
           clientHint.includes('browser') ||
           headers['origin'] ||
           headers['referer'] ||
           process.env.MCP_CLIENT === 'web';
  }

  private isGenericMCP(userAgent: string, clientHint: string, headers: any): boolean {
    return headers['content-type']?.includes('application/json') ||
           headers['x-mcp-version'] ||
           clientHint.includes('mcp') ||
           process.env.MCP_CLIENT === 'generic';
  }

  private getClaudeInfo(): ClientInfo {
    return {
      type: ClientType.CLAUDE,
      name: 'Claude',
      capabilities: {
        streaming: true,
        progress: true,
        sse: true,
        restApi: true,
        richFormatting: true,
        fileOperations: true,
        sessionId: true
      },
      compatibility: {
        needsWorkarounds: [],
        preferredFormat: 'json',
        responseStructure: 'detailed'
      }
    };
  }

  private getCursorInfo(): ClientInfo {
    return {
      type: ClientType.CURSOR,
      name: 'Cursor',
      capabilities: {
        streaming: true,
        progress: true,
        sse: true,
        restApi: true,
        richFormatting: true,
        fileOperations: true,
        sessionId: false // Cursor prefers stateless connections
      },
      compatibility: {
        needsWorkarounds: ['stateless-connections', 'compact-responses'],
        preferredFormat: 'json',
        responseStructure: 'compact'
      }
    };
  }

  private getWindsurfInfo(): ClientInfo {
    return {
      type: ClientType.WINDSURF,
      name: 'Windsurf',
      capabilities: {
        streaming: true,
        progress: true,
        sse: true,
        restApi: true,
        richFormatting: true,
        fileOperations: true,
        sessionId: true
      },
      compatibility: {
        needsWorkarounds: ['enhanced-error-messages'],
        preferredFormat: 'json',
        responseStructure: 'detailed'
      }
    };
  }

  private getKiroInfo(): ClientInfo {
    return {
      type: ClientType.KIRO,
      name: 'Kiro',
      capabilities: {
        streaming: false, // Kiro prefers request/response
        progress: false,
        sse: false,
        restApi: true,
        richFormatting: true,
        fileOperations: true,
        sessionId: true
      },
      compatibility: {
        needsWorkarounds: ['no-streaming', 'synchronous-mode'],
        preferredFormat: 'json',
        responseStructure: 'nested'
      }
    };
  }

  private getWebIDEInfo(): ClientInfo {
    return {
      type: ClientType.WEB_IDE,
      name: 'Web IDE',
      capabilities: {
        streaming: true,
        progress: true,
        sse: true,
        restApi: true, // Primary method for web IDEs
        richFormatting: true,
        fileOperations: false,
        sessionId: true
      },
      compatibility: {
        needsWorkarounds: ['cors-headers', 'web-formatting'],
        preferredFormat: 'json',
        responseStructure: 'detailed'
      }
    };
  }

  private getGenericInfo(): ClientInfo {
    return {
      type: ClientType.GENERIC,
      name: 'Generic MCP Client',
      capabilities: {
        streaming: true,
        progress: true,
        sse: true,
        restApi: true,
        richFormatting: false,
        fileOperations: true,
        sessionId: true
      },
      compatibility: {
        needsWorkarounds: [],
        preferredFormat: 'json',
        responseStructure: 'compact'
      }
    };
  }

  private getUnknownInfo(): ClientInfo {
    return {
      type: ClientType.UNKNOWN,
      name: 'Unknown Client',
      capabilities: {
        streaming: false,
        progress: false,
        sse: true,
        restApi: true,
        richFormatting: false,
        fileOperations: true,
        sessionId: true
      },
      compatibility: {
        needsWorkarounds: ['safe-mode'],
        preferredFormat: 'json',
        responseStructure: 'compact'
      }
    };
  }

  /**
   * Apply client-specific workarounds to the response
   */
  adaptResponse(response: any, client: ClientInfo): any {
    let adapted = { ...response };

    // Apply workarounds
    for (const workaround of client.compatibility.needsWorkarounds) {
      switch (workaround) {
        case 'compact-responses':
          adapted = this.compactResponse(adapted);
          break;
        case 'stateless-connections':
          adapted = this.makeStateless(adapted);
          break;
        case 'enhanced-error-messages':
          adapted = this.enhanceErrors(adapted);
          break;
        case 'no-streaming':
          adapted = this.removeStreamReferences(adapted);
          break;
        case 'synchronous-mode':
          adapted = this.makeSynchronous(adapted);
          break;
        case 'cors-headers':
          adapted = this.addCorsInfo(adapted);
          break;
        case 'web-formatting':
          adapted = this.formatForWeb(adapted);
          break;
        case 'safe-mode':
          adapted = this.sanitizeResponse(adapted);
          break;
      }
    }

    // Format according to preference
    if (client.compatibility.preferredFormat === 'text') {
      adapted = this.convertToText(adapted);
    } else if (client.compatibility.preferredFormat === 'markdown') {
      adapted = this.convertToMarkdown(adapted);
    }

    return adapted;
  }

  private compactResponse(response: any): any {
    if (response.content && Array.isArray(response.content)) {
      response.content = response.content.filter((item: any) => item.type === 'text');
    }
    if (response._meta) {
      delete response._meta;
    }
    return response;
  }

  private makeStateless(response: any): any {
    if (response._sessionId) {
      delete response._sessionId;
    }
    if (response._meta && response._meta.sessionId) {
      delete response._meta.sessionId;
    }
    return response;
  }

  private enhanceErrors(response: any): any {
    if (response.error) {
      response.error = {
        ...response.error,
        troubleshooting: 'Please check your connection and try again',
        documentation: 'https://github.com/your-repo/easypanel-mcp'
      };
    }
    return response;
  }

  private removeStreamReferences(response: any): any {
    if (response._meta && response._meta.streaming) {
      delete response._meta.streaming;
    }
    return response;
  }

  private makeSynchronous(response: any): any {
    response.isComplete = true;
    response.needsPolling = false;
    return response;
  }

  private addCorsInfo(response: any): any {
    response._cors = {
      allowedOrigins: ['*'],
      allowedMethods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-MCP-Session-ID']
    };
    return response;
  }

  private formatForWeb(response: any): any {
    if (response.content && Array.isArray(response.content)) {
      response.content = response.content.map((item: any) => ({
        ...item,
        displayType: item.type === 'text' ? 'markdown' : item.type
      }));
    }
    return response;
  }

  private sanitizeResponse(response: any): any {
    const sanitized = JSON.parse(JSON.stringify(response));
    if (sanitized._meta) {
      delete sanitized._meta;
    }
    return sanitized;
  }

  private convertToText(response: any): any {
    if (response.content && Array.isArray(response.content)) {
      response.content = response.content.map((item: any) => ({
        type: 'text',
        text: JSON.stringify(item, null, 2)
      }));
    }
    return response;
  }

  private convertToMarkdown(response: any): any {
    if (response.content && Array.isArray(response.content)) {
      response.content = response.content.map((item: any) => ({
        type: 'text',
        text: `\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\``
      }));
    }
    return response;
  }

  /**
   * Get client-specific configuration
   */
  getClientConfig(client: ClientInfo): any {
    return {
      supportsStreaming: client.capabilities.streaming,
      supportsProgress: client.capabilities.progress,
      supportsSSE: client.capabilities.sse,
      supportsRestApi: client.capabilities.restApi,
      responseFormat: client.compatibility.preferredFormat,
      responseStructure: client.compatibility.responseStructure,
      workarounds: client.compatibility.needsWorkarounds
    };
  }

  /**
   * Clear the client cache
   */
  clearCache(): void {
    this.clientCache.clear();
  }
}

export default ClientDetector;