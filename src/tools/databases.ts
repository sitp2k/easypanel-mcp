/**
 * Database Service Management Tools (Redis, MySQL, PostgreSQL)
 */

import { z } from 'zod';
import { getClient } from '../api/client.js';
import { ValidationError, validateProjectServiceNameWithRefine } from '../utils/validation.js';

export const databaseTools = {
  create_redis: {
    name: 'create_redis',
    description: 'Create a Redis database service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name for the Redis service (lowercase, alphanumeric, hyphens, underscores)',
        },
        password: {
          type: 'string',
          description: 'Redis password',
        },
        image: {
          type: 'string',
          description: 'Redis Docker image (default: redis:7)',
        },
      },
      required: ['projectName', 'serviceName', 'password'],
    },
  },

  inspect_redis: {
    name: 'inspect_redis',
    description: 'Get Redis service details including connection info',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the Redis service',
        },
      },
      required: ['projectName', 'serviceName'],
    },
  },

  create_mysql: {
    name: 'create_mysql',
    description: 'Create a MySQL database service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name for the MySQL service (lowercase, alphanumeric, hyphens, underscores)',
        },
        databaseName: {
          type: 'string',
          description: 'Name of the default database',
        },
        user: {
          type: 'string',
          description: 'MySQL user',
        },
        password: {
          type: 'string',
          description: 'MySQL user password',
        },
        rootPassword: {
          type: 'string',
          description: 'MySQL root password',
        },
        image: {
          type: 'string',
          description: 'MySQL Docker image (default: mysql:8.0)',
        },
      },
      required: ['projectName', 'serviceName', 'databaseName', 'user', 'password', 'rootPassword'],
    },
  },

  create_postgres: {
    name: 'create_postgres',
    description: 'Create a PostgreSQL database service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name for the PostgreSQL service (lowercase, alphanumeric, hyphens, underscores)',
        },
        databaseName: {
          type: 'string',
          description: 'Name of the default database',
        },
        user: {
          type: 'string',
          description: 'PostgreSQL user',
        },
        password: {
          type: 'string',
          description: 'PostgreSQL password',
        },
        image: {
          type: 'string',
          description: 'PostgreSQL Docker image (default: postgres:15)',
        },
      },
      required: ['projectName', 'serviceName', 'databaseName', 'user', 'password'],
    },
  },

  destroy_db_service: {
    name: 'destroy_db_service',
    description: 'Destroy a database service (Redis, MySQL, or PostgreSQL) - WARNING: This will permanently delete the database and all its data!',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the database service to destroy',
        },
        type: {
          type: 'string',
          description: 'Database type',
          enum: ['redis', 'mysql', 'postgres'],
        },
        confirm: {
          type: 'boolean',
          description: 'Confirmation flag - must be set to true to proceed with destruction',
        },
      },
      required: ['projectName', 'serviceName', 'type', 'confirm'],
    },
  },

  update_redis_password: {
    name: 'update_redis_password',
    description: 'Update the password for a Redis service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
        serviceName: {
          type: 'string',
          description: 'Name of the Redis service',
        },
        password: {
          type: 'string',
          description: 'New Redis password (minimum 8 characters)',
          minLength: 8,
        },
      },
      required: ['projectName', 'serviceName', 'password'],
    },
  },
};

export async function handleDatabaseTool(name: string, args: unknown) {
  const client = getClient();

  try {  // Wrap entire switch in try-catch for validation errors
    switch (name) {
    case 'create_redis': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1).refine(validateProjectServiceNameWithRefine('service'), {
          message: 'Service name must be 2-64 characters, lowercase alphanumeric, hyphens, or underscores, and start with a letter or number',
        }),
        password: z.string().min(1),
        image: z.string().default('redis:7'),
      });
      const params = schema.parse(args);

      const result = await client.createRedis(
        params.projectName,
        params.serviceName,
        params.password,
        params.image
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Redis service '${params.serviceName}' created`,
              connectionInfo: {
                internal: `redis://:${params.password}@${params.projectName}_${params.serviceName}:6379`,
                note: 'Use internal URL for services in the same project',
              },
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'inspect_redis': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
      });
      const params = schema.parse(args);

      const result = await client.inspectRedis(params.projectName, params.serviceName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'create_mysql': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1).refine(validateProjectServiceNameWithRefine('service'), {
          message: 'Service name must be 2-64 characters, lowercase alphanumeric, hyphens, or underscores, and start with a letter or number',
        }),
        databaseName: z.string().min(1),
        user: z.string().min(1),
        password: z.string().min(1),
        rootPassword: z.string().min(1),
        image: z.string().default('mysql:8.0'),
      });
      const params = schema.parse(args);

      const result = await client.createMySQL(
        params.projectName,
        params.serviceName,
        params.databaseName,
        params.user,
        params.password,
        params.rootPassword,
        params.image
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `MySQL service '${params.serviceName}' created`,
              connectionInfo: {
                internal: `mysql://${params.user}:${params.password}@${params.projectName}_${params.serviceName}:3306/${params.databaseName}`,
                note: 'Use internal URL for services in the same project',
              },
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'create_postgres': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1).refine(validateProjectServiceNameWithRefine('service'), {
          message: 'Service name must be 2-64 characters, lowercase alphanumeric, hyphens, or underscores, and start with a letter or number',
        }),
        databaseName: z.string().min(1),
        user: z.string().min(1),
        password: z.string().min(1),
        image: z.string().default('postgres:15'),
      });
      const params = schema.parse(args);

      const result = await client.createPostgres(
        params.projectName,
        params.serviceName,
        params.databaseName,
        params.user,
        params.password,
        params.image
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `PostgreSQL service '${params.serviceName}' created`,
              connectionInfo: {
                internal: `postgresql://${params.user}:${params.password}@${params.projectName}_${params.serviceName}:5432/${params.databaseName}`,
                note: 'Use internal URL for services in the same project',
              },
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'destroy_db_service': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        type: z.enum(['redis', 'mysql', 'postgres']),
        confirm: z.boolean().refine(val => val === true, {
          message: 'You must set confirm to true to destroy the database service',
        }),
      });
      const params = schema.parse(args);

      if (!params.confirm) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: 'Confirmation required',
                message: 'This action will permanently delete the database and all its data. Set confirm to true to proceed.',
              }, null, 2),
            },
          ],
        };
      }

      const result = await client.destroyDBService(
        params.projectName,
        params.serviceName,
        params.type
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `${params.type.charAt(0).toUpperCase() + params.type.slice(1)} service '${params.serviceName}' destroyed permanently`,
              warning: 'All data has been permanently deleted',
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'update_redis_password': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        password: z.string().min(8, 'Password must be at least 8 characters long'),
      });
      const params = schema.parse(args);

      const result = await client.updateRedisPassword(
        params.projectName,
        params.serviceName,
        params.password
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Password updated for Redis service '${params.serviceName}'`,
              connectionInfo: {
                internal: `redis://:${params.password}@${params.projectName}_${params.serviceName}:6379`,
                note: 'Use this updated password for connecting to Redis',
              },
              result,
            }, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown database tool: ${name}`);
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
