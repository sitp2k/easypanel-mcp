/**
 * App Service Management Tools
 */

import { z } from 'zod';
import { getClient } from '../api/client.js';
import { ContainerLog } from '../types/easypanel.js';
import { ValidationError, validateGitRepo, validateProjectServiceNameWithRefine } from '../utils/validation.js';

export const serviceTools = {
  create_app_service: {
    name: 'create_app_service',
    description: 'Create a new app service in a project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name for the new service (lowercase, alphanumeric, hyphens, underscores)',
        },
      },
      required: ['projectName', 'serviceName'],
    },
  },

  deploy_from_image: {
    name: 'deploy_from_image',
    description: 'Deploy a service from a Docker image',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service',
        },
        image: {
          type: 'string',
          description: 'Docker image (e.g., nginx:latest, ghcr.io/user/image:tag)',
        },
        username: {
          type: 'string',
          description: 'Docker registry username (optional, for private images)',
        },
        password: {
          type: 'string',
          description: 'Docker registry password (optional, for private images)',
        },
      },
      required: ['projectName', 'serviceName', 'image'],
    },
  },

  deploy_from_git: {
    name: 'deploy_from_git',
    description: 'Deploy a service from a Git repository (uses Nixpacks or Buildpacks)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service',
        },
        repo: {
          type: 'string',
          description: 'Git repository URL',
        },
        ref: {
          type: 'string',
          description: 'Git branch or tag (default: main)',
        },
        path: {
          type: 'string',
          description: 'Path to app within repo (default: /)',
        },
      },
      required: ['projectName', 'serviceName', 'repo'],
    },
  },

  deploy_from_dockerfile: {
    name: 'deploy_from_dockerfile',
    description: 'Deploy a service using a Dockerfile from a Git repository',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service',
        },
        repo: {
          type: 'string',
          description: 'Git repository URL',
        },
        ref: {
          type: 'string',
          description: 'Git branch or tag (default: main)',
        },
        path: {
          type: 'string',
          description: 'Path to app within repo (default: /)',
        },
        dockerfilePath: {
          type: 'string',
          description: 'Path to Dockerfile (default: ./Dockerfile)',
        },
      },
      required: ['projectName', 'serviceName', 'repo'],
    },
  },

  start_service: {
    name: 'start_service',
    description: 'Start a stopped service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service',
        },
      },
      required: ['projectName', 'serviceName'],
    },
  },

  stop_service: {
    name: 'stop_service',
    description: 'Stop a running service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service',
        },
      },
      required: ['projectName', 'serviceName'],
    },
  },

  restart_service: {
    name: 'restart_service',
    description: 'Restart a service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service',
        },
      },
      required: ['projectName', 'serviceName'],
    },
  },

  redeploy_service: {
    name: 'redeploy_service',
    description: 'Trigger a new deployment for a service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service',
        },
      },
      required: ['projectName', 'serviceName'],
    },
  },

  destroy_service: {
    name: 'destroy_service',
    description: 'Delete a service (DESTRUCTIVE - cannot be undone)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service to delete',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion',
        },
      },
      required: ['projectName', 'serviceName', 'confirm'],
    },
  },

  update_env: {
    name: 'update_env',
    description: 'Update environment variables for a service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service',
        },
        env: {
          type: 'string',
          description: 'Environment variables as KEY=VALUE pairs, separated by newlines',
        },
      },
      required: ['projectName', 'serviceName', 'env'],
    },
  },

  update_resources: {
    name: 'update_resources',
    description: 'Update resource limits (memory/CPU) for a service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service',
        },
        memoryReservation: {
          type: 'number',
          description: 'Memory reservation in MB',
        },
        memoryLimit: {
          type: 'number',
          description: 'Memory limit in MB',
        },
        cpuReservation: {
          type: 'number',
          description: 'CPU reservation (0.5 = 50% of one core)',
        },
        cpuLimit: {
          type: 'number',
          description: 'CPU limit (1.0 = one full core)',
        },
      },
      required: ['projectName', 'serviceName'],
    },
  },

  get_service_stats: {
    name: 'get_service_stats',
    description: 'Get CPU, memory, and network statistics for a service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service',
        },
      },
      required: ['projectName', 'serviceName'],
    },
  },

  get_service_logs: {
    name: "get_service_logs",
    description: "Get logs for a service with filtering options",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectName: {
          type: "string",
          description: "Name of the project",
        },
        serviceName: {
          type: "string",
          description: "Name of the service",
        },
        since: {
          type: "string",
          description: "ISO timestamp or RFC3339 string to get logs since this time (optional)",
        },
        until: {
          type: "string",
          description: "ISO timestamp or RFC3339 string to get logs until this time (optional)",
        },
        lines: {
          type: "number",
          description: "Number of log lines to retrieve (default: 100, max: 10000)",
        },
        timestamps: {
          type: "boolean",
          description: "Include timestamps in log output (default: true)",
        },
        level: {
          type: "array",
          items: {
            type: "string",
            enum: ["debug", "info", "warn", "error", "fatal"],
          },
          description: "Filter by log levels (optional)",
        },
        search: {
          type: "string",
          description: "Search term to filter log messages (optional)",
        },
      },
      required: ["projectName", "serviceName"],
    },
  },

  search_logs: {
    name: "search_logs",
    description: "Search logs for a specific query string",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectName: {
          type: "string",
          description: "Name of the project",
        },
        serviceName: {
          type: "string",
          description: "Name of the service",
        },
        query: {
          type: "string",
          description: "Search query to find in log messages",
        },
        since: {
          type: "string",
          description: "ISO timestamp or RFC3339 string to search logs since this time (optional)",
        },
        until: {
          type: "string",
          description: "ISO timestamp or RFC3339 string to search logs until this time (optional)",
        },
        lines: {
          type: "number",
          description: "Number of log lines to search through (default: 1000)",
        },
        level: {
          type: "array",
          items: {
            type: "string",
            enum: ["debug", "info", "warn", "error", "fatal"],
          },
          description: "Filter by log levels (optional)",
        },
      },
      required: ["projectName", "serviceName", "query"],
    },
  },

  get_log_stream_url: {
    name: "get_log_stream_url",
    description: "Get WebSocket URL for real-time log streaming",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectName: {
          type: "string",
          description: "Name of the project",
        },
        serviceName: {
          type: "string",
          description: "Name of the service",
        },
        follow: {
          type: "boolean",
          description: "Follow log stream in real-time (default: true)",
        },
        since: {
          type: "string",
          description: "ISO timestamp or RFC3339 string to stream logs since this time (optional)",
        },
        lines: {
          type: "number",
          description: "Number of past lines to include before streaming (default: 100)",
        },
      },
      required: ["projectName", "serviceName"],
    },
  },


  get_build_status: {
    name: 'get_build_status',
    description: 'Get the build status of a deployment',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service',
        },
        buildId: {
          type: 'string',
          description: 'Build ID (optional)',
        },
      },
      required: ['projectName', 'serviceName'],
    },
  },

  wait_for_deploy: {
    name: 'wait_for_deploy',
    description: 'Wait for deployment to complete with progress updates',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the service',
        },
        buildId: {
          type: 'string',
          description: 'Build ID from deploy response',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 300000 for 5 minutes)',
        },
        interval: {
          type: 'number',
          description: 'Polling interval in milliseconds (default: 5000)',
        },
      },
      required: ['projectName', 'serviceName', 'buildId'],
    },
  },
};

export async function handleServiceTool(name: string, args: unknown) {
  const client = getClient();

  try {  // Wrap entire switch in try-catch for validation errors
    switch (name) {
    case 'create_app_service': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1).refine(validateProjectServiceNameWithRefine('service'), {
          message: 'Service name must be 2-64 characters, lowercase alphanumeric, hyphens, or underscores, and start with a letter or number',
        }),
      });
      const params = schema.parse(args);

      const result = await client.createAppService(params.projectName, params.serviceName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Service '${params.serviceName}' created in project '${params.projectName}'`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'deploy_from_image': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        image: z.string().min(1),
        username: z.string().optional(),
        password: z.string().optional(),
      });
      const params = schema.parse(args);

      const result = await client.deployFromImage(
        params.projectName,
        params.serviceName,
        params.image,
        params.username,
        params.password
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Deploying '${params.image}' to '${params.serviceName}'`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'deploy_from_git': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        repo: z.string().refine((url) => {
          try {
            validateGitRepo(url);
            return true;
          } catch (error) {
            return false;
          }
        }, {
          message: 'Must be a valid Git repository URL ending with .git or a GitHub URL'
        }),
        ref: z.string().default('main'),
        path: z.string().default('/'),
      });
      const params = schema.parse(args);

      const result = await client.deployFromGit(
        params.projectName,
        params.serviceName,
        params.repo,
        params.ref,
        params.path
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Deploying from '${params.repo}' (${params.ref}) to '${params.serviceName}'`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'deploy_from_dockerfile': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        repo: z.string().refine((url) => {
          try {
            validateGitRepo(url);
            return true;
          } catch (error) {
            return false;
          }
        }, {
          message: 'Must be a valid Git repository URL ending with .git or a GitHub URL'
        }),
        ref: z.string().default('main'),
        path: z.string().default('/'),
        dockerfilePath: z.string().default('./Dockerfile'),
      });
      const params = schema.parse(args);

      const result = await client.deployFromDockerfile(
        params.projectName,
        params.serviceName,
        params.repo,
        params.ref,
        params.path,
        params.dockerfilePath
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Deploying with Dockerfile from '${params.repo}'`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'start_service': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
      });
      const params = schema.parse(args);

      const result = await client.startService(params.projectName, params.serviceName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Service '${params.serviceName}' started`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'stop_service': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
      });
      const params = schema.parse(args);

      const result = await client.stopService(params.projectName, params.serviceName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Service '${params.serviceName}' stopped`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'restart_service': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
      });
      const params = schema.parse(args);

      const result = await client.restartService(params.projectName, params.serviceName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Service '${params.serviceName}' restarted`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'redeploy_service': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
      });
      const params = schema.parse(args);

      const result = await client.deployService(params.projectName, params.serviceName) as any;
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Deployment started for '${params.serviceName}' (async)`,
              buildId: result.buildId,
              status: result.status,
              note: 'Deployment is running in background. Use get_build_status or wait_for_deploy to track progress.',
            }, null, 2),
          },
        ],
      };
    }

    case 'destroy_service': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        confirm: z.literal(true),
      });
      const params = schema.parse(args);

      const result = await client.destroyAppService(params.projectName, params.serviceName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Service '${params.serviceName}' deleted`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'update_env': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        env: z.string(),
      });
      const params = schema.parse(args);

      const result = await client.updateEnv(params.projectName, params.serviceName, params.env);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Environment variables updated for '${params.serviceName}'`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'update_resources': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        memoryReservation: z.number().optional(),
        memoryLimit: z.number().optional(),
        cpuReservation: z.number().optional(),
        cpuLimit: z.number().optional(),
      }).refine(
        (data) => {
          return (
            data.memoryReservation !== undefined ||
            data.memoryLimit !== undefined ||
            data.cpuReservation !== undefined ||
            data.cpuLimit !== undefined
          );
        },
        {
          message: 'At least one resource parameter must be provided (memoryReservation, memoryLimit, cpuReservation, or cpuLimit)',
          path: ['resources'],
        }
      );
      const params = schema.parse(args);

      const result = await client.updateResources(
        params.projectName,
        params.serviceName,
        params.memoryReservation,
        params.memoryLimit,
        params.cpuReservation,
        params.cpuLimit
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Resources updated for '${params.serviceName}'`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'get_service_stats': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
      });
      const params = schema.parse(args);

      const result = await client.getServiceStats(params.projectName, params.serviceName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'get_service_logs': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        since: z.string().optional(),
        until: z.string().optional(),
        lines: z.number().min(1).max(10000).optional(),
        timestamps: z.boolean().optional(),
        level: z.array(z.enum(['debug', 'info', 'warn', 'error', 'fatal'])).optional(),
        search: z.string().optional(),
      });
      const params = schema.parse(args);

      const logOptions = {
        since: params.since,
        until: params.until,
        lines: params.lines || 100,
        timestamps: params.timestamps !== undefined ? params.timestamps : true,
        filters: {
          level: params.level,
          search: params.search,
        },
      };

      const result = await client.getServiceLogs(params.projectName, params.serviceName, logOptions);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              service: result.service,
              logCount: result.logs.length,
              hasMore: result.hasMore,
              logs: result.logs.map(log => ({
                timestamp: log.timestamp,
                level: log.level,
                message: log.message,
                container: log.container,
                service: log.service,
                stream: log.stream,
              })),
            }, null, 2),
          },
        ],
      };
    }

    case 'search_logs': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        query: z.string().min(1),
        since: z.string().optional(),
        until: z.string().optional(),
        lines: z.number().min(1).max(10000).optional(),
        level: z.array(z.enum(['debug', 'info', 'warn', 'error', 'fatal'])).optional(),
      });
      const params = schema.parse(args);

      const logOptions = {
        since: params.since,
        until: params.until,
        lines: params.lines || 1000,
        filters: {
          level: params.level,
        },
      };

      const result = await client.searchLogs(params.projectName, params.serviceName, params.query, logOptions);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              service: result.service,
              query: result.query,
              totalMatches: result.totalMatches,
              matchesFound: result.logs.length,
              logs: result.logs.map(log => ({
                timestamp: log.timestamp,
                level: log.level,
                message: log.message,
                container: log.container,
                service: log.service,
                stream: log.stream,
              })),
            }, null, 2),
          },
        ],
      };
    }

    case 'get_log_stream_url': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        follow: z.boolean().default(true),
        since: z.string().optional(),
        lines: z.number().min(0).max(10000).default(100),
      });
      const params = schema.parse(args);

      const logOptions = {
        follow: params.follow,
        since: params.since,
        lines: params.lines,
      };

      const wsUrl = client.getLogStreamUrlWithOptions(params.projectName, params.serviceName, logOptions);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              service: `${params.projectName}_${params.serviceName}`,
              websocketUrl: wsUrl,
              instructions: [
                'Use this WebSocket URL to connect to the real-time log stream',
                'The connection will remain open and push new logs as they are generated',
                'Logs are sent as JSON objects with timestamp, level, message, and metadata',
                'Use the "follow" parameter to control whether to stream new logs',
                'Use the "lines" parameter to include recent history before streaming',
              ],
              usage: {
                curl: `curl -i -N -H "Connection: Upgrade" \\
     -H "Upgrade: websocket" \\
     -H "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \\
     -H "Sec-WebSocket-Version: 13" \\
     "${wsUrl}"`,
                javascript: `const ws = new WebSocket('${wsUrl}');
ws.onmessage = (event) => {
  const log = JSON.parse(event.data);
  console.log(log.timestamp, log.level, log.message);
};`,
              },
            }, null, 2),
          },
        ],
      };
    }    case 'get_build_status': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        buildId: z.string().optional(),
      });
      const params = schema.parse(args);

      const result = await client.getBuildStatus(params.projectName, params.serviceName, params.buildId);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              buildId: (result as any).id,
              status: (result as any).status,
              startTime: (result as any).startTime,
              endTime: (result as any).endTime,
              error: (result as any).error,
              logs: (result as any).logs,
            }, null, 2),
          },
        ],
      };
    }

    case 'wait_for_deploy': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        buildId: z.string().min(1),
        timeout: z.number().optional(),
        interval: z.number().optional(),
      });
      const params = schema.parse(args);

      // Track progress
      const progressUpdates: string[] = [];

      const result = await client.waitForDeploy(
        params.projectName,
        params.serviceName,
        params.buildId,
        params.timeout || 10 * 60 * 1000 // 10 minutes default
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              buildId: (result as any).id,
              finalStatus: (result as any).status,
              success: (result as any).status === 'success',
              startTime: (result as any).startTime,
              endTime: (result as any).endTime,
              error: (result as any).error,
              progressUpdates,
              duration: (result as any).endTime && (result as any).startTime
                ? new Date((result as any).endTime).getTime() - new Date((result as any).startTime).getTime()
                : null,
            }, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown service tool: ${name}`);
    }
  } catch (error) {
    // Handle validation errors specifically
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

    // Handle Zod validation errors
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

    // Re-throw other errors
    throw error;
  }
}
