/**
 * System Detection and Monitoring Tools
 * Provides system information, IP detection, domain discovery, and health monitoring
 */

import { z } from 'zod';
import { getClient } from '../api/client.js';
import { ValidationError } from '../utils/validation.js';

// These imports will be handled in the client.ts file
// The Node.js modules are already available in the runtime environment

export const systemTools = {
  system_get_ip: {
    name: 'system_get_ip',
    description: 'Get server IP address(es) - both public and local network interfaces',
    inputSchema: {
      type: 'object' as const,
      properties: {
        includePrivate: {
          type: 'boolean',
          description: 'Include private network addresses (default: true)',
          default: true,
        },
        includeIPv6: {
          type: 'boolean',
          description: 'Include IPv6 addresses (default: false)',
          default: false,
        },
        publicOnly: {
          type: 'boolean',
          description: 'Get only public IP address (default: false)',
          default: false,
        },
      },
      required: [],
    },
  },

  system_get_domain: {
    name: 'system_get_domain',
    description: 'Detect EasyPanel domain URL and configured domains',
    inputSchema: {
      type: 'object' as const,
      properties: {
        includeDefaultPort: {
          type: 'boolean',
          description: 'Include default port in URLs (default: false)',
          default: false,
        },
        checkSSL: {
          type: 'boolean',
          description: 'Check SSL certificate status (default: true)',
          default: true,
        },
      },
      required: [],
    },
  },

  system_get_info: {
    name: 'system_get_info',
    description: 'Get comprehensive system specifications (OS, CPU, memory, disk, Docker)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        includeDocker: {
          type: 'boolean',
          description: 'Include Docker information (default: true)',
          default: true,
        },
        includeNetwork: {
          type: 'boolean',
          description: 'Include network interface details (default: true)',
          default: true,
        },
        includeServices: {
          type: 'boolean',
          description: 'Include system services status (default: true)',
          default: true,
        },
      },
      required: [],
    },
  },

  system_health_check: {
    name: 'system_health_check',
    description: 'Perform comprehensive health assessment of the EasyPanel server',
    inputSchema: {
      type: 'object' as const,
      properties: {
        checks: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['disk', 'memory', 'cpu', 'docker', 'services', 'network', 'ssl'],
          },
          description: 'Specific health checks to perform (default: all)',
        },
        verbose: {
          type: 'boolean',
          description: 'Include detailed diagnostics (default: false)',
          default: false,
        },
        thresholdWarning: {
          type: 'number',
          description: 'Warning threshold percentage (default: 80)',
          default: 80,
        },
        thresholdCritical: {
          type: 'number',
          description: 'Critical threshold percentage (default: 95)',
          default: 95,
        },
      },
      required: [],
    },
  },
};

/**
 * Handle system tool requests
 */
export async function handleSystemTool(name: string, args: unknown) {
  const client = getClient();

  try {
    switch (name) {
      case 'system_get_ip': {
        const schema = z.object({
          includePrivate: z.boolean().default(true),
          includeIPv6: z.boolean().default(false),
          publicOnly: z.boolean().default(false),
        });
        const params = schema.parse(args);

        const result = await client.getServerIPAddress(
          params.includePrivate,
          params.includeIPv6,
          params.publicOnly
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                addresses: result,
                summary: {
                  total: result.length,
                  public: result.filter(ip => ip.type === 'public').length,
                  private: result.filter(ip => ip.type === 'private').length,
                  ipv4: result.filter(ip => ip.family === 'IPv4').length,
                  ipv6: result.filter(ip => ip.family === 'IPv6').length,
                },
              }, null, 2),
            },
          ],
        };
      }

      case 'system_get_domain': {
        const schema = z.object({
          includeDefaultPort: z.boolean().default(false),
          checkSSL: z.boolean().default(true),
        });
        const params = schema.parse(args);

        const result = await client.getPanelDomain(
          params.includeDefaultPort,
          params.checkSSL
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                ...result,
              }, null, 2),
            },
          ],
        };
      }

      case 'system_get_info': {
        const schema = z.object({
          includeDocker: z.boolean().default(true),
          includeNetwork: z.boolean().default(true),
          includeServices: z.boolean().default(true),
        });
        const params = schema.parse(args);

        const result = await client.getSystemInfo(
          params.includeDocker,
          params.includeNetwork,
          params.includeServices
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                system: result,
              }, null, 2),
            },
          ],
        };
      }

      case 'system_health_check': {
        const schema = z.object({
          checks: z.array(z.enum(['disk', 'memory', 'cpu', 'docker', 'services', 'network', 'ssl'])).optional(),
          verbose: z.boolean().default(false),
          thresholdWarning: z.number().min(0).max(100).default(80),
          thresholdCritical: z.number().min(0).max(100).default(95),
        });
        const params = schema.parse(args);

        const result = await client.performHealthCheck(
          params.checks,
          params.verbose,
          params.thresholdWarning,
          params.thresholdCritical
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                health: result,
                recommendations: generateHealthRecommendations(result),
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown system tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: 'Validation Error',
              message: error.message,
              field: error.field,
              value: error.value,
            }, null, 2),
          },
        ],
      };
    }

    if (error instanceof z.ZodError) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: 'Input Validation Error',
              message: 'Invalid input parameters',
              details: error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
                code: err.code,
              })),
            }, null, 2),
          },
        ],
      };
    }

    throw error;
  }
}

/**
 * Generate health recommendations based on check results
 */
function generateHealthRecommendations(healthResult: any): string[] {
  const recommendations: string[] = [];

  // CPU recommendations
  if (healthResult.cpu?.usagePercent > 90) {
    recommendations.push('⚠️ Critical CPU usage detected. Consider scaling up or optimizing workloads');
  } else if (healthResult.cpu?.usagePercent > 70) {
    recommendations.push('ℹ️ High CPU usage detected. Monitor closely');
  }

  // Memory recommendations
  if (healthResult.memory?.usagePercent > 90) {
    recommendations.push('🚨 Critical memory usage detected. Risk of OOM errors');
  } else if (healthResult.memory?.usagePercent > 75) {
    recommendations.push('ℹ️ High memory usage detected. Consider adding more RAM');
  }

  // Disk recommendations
  if (healthResult.disk?.usagePercent > 90) {
    recommendations.push('🚨 Critical disk usage. Free up space immediately');
  } else if (healthResult.disk?.usagePercent > 80) {
    recommendations.push('⚠️ Disk space running low. Clean up old containers and images');
  }

  // Docker recommendations
  if (healthResult.docker?.status !== 'healthy') {
    recommendations.push('🔧 Docker service needs attention');
  }

  // Services recommendations
  const failedServices = healthResult.services?.filter((s: any) => s.status !== 'running');
  if (failedServices?.length > 0) {
    recommendations.push(`🛠️ Services need attention: ${failedServices.map((s: any) => s.name).join(', ')}`);
  }

  return recommendations;
}