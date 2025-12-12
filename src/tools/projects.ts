/**
 * Project Management Tools
 */

import { z } from 'zod';
import { getClient } from '../api/client.js';
import { ValidationError, validateProjectServiceNameWithRefine } from '../utils/validation.js';

export const projectTools = {
  list_projects: {
    name: 'list_projects',
    description: 'List all EasyPanel projects with their services',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },

  create_project: {
    name: 'create_project',
    description: 'Create a new project in EasyPanel',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name for the new project (lowercase, alphanumeric, hyphens, and underscores allowed)',
        },
      },
      required: ['projectName'],
    },
  },

  inspect_project: {
    name: 'inspect_project',
    description: 'Get detailed information about a project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project to inspect',
        },
      },
      required: ['projectName'],
    },
  },

  destroy_project: {
    name: 'destroy_project',
    description: 'Delete a project and ALL its services (DESTRUCTIVE - cannot be undone)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project to delete',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion',
        },
      },
      required: ['projectName', 'confirm'],
    },
  },
};

export async function handleProjectTool(name: string, args: unknown) {
  const client = getClient();

  try {  // Wrap entire switch in try-catch for validation errors
    switch (name) {
    case 'list_projects': {
      const projects = await client.listProjects();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    }

    case 'create_project': {
      const schema = z.object({
        projectName: z.string().min(1).refine(validateProjectServiceNameWithRefine('project'), {
          message: 'Project name must be 2-64 characters, lowercase alphanumeric, hyphens, or underscores, and start with a letter or number',
        }),
      });
      const params = schema.parse(args);

      const result = await client.createProject(params.projectName);

      // Get upgrade suggestion if applicable
      const upgradeSuggestion = client.getUpgradeSuggestion('create_project');

      const response: any = {
        success: true,
        message: `Project '${params.projectName}' created successfully`,
        result,
      };

      // Add upgrade tip if available
      if (upgradeSuggestion) {
        response.tip = {
          message: upgradeSuggestion.message,
          url: upgradeSuggestion.url
        };

        // Check if this might be hitting project limits
        const planInfo = client.getPlanInfo();
        if (planInfo.isFree && (planInfo.detectedFeatures.maxProjectsSeen || 0) >= 2) {
          response.warning = "You're approaching the Free tier project limit. Upgrade to Premium for unlimited projects!";
        }
      }

      let responseText = JSON.stringify(response, null, 2);

      // Add upgrade CTA for free tier users
      if (upgradeSuggestion) {
        responseText += `\n\n💡 ${upgradeSuggestion.message}\n\n🚀 Upgrade now: ${upgradeSuggestion.url}\n\n*Premium unlocks unlimited projects and professional features!*`;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: responseText,
          },
        ],
      };
    }

    case 'inspect_project': {
      const schema = z.object({
        projectName: z.string().min(1),
      });
      const params = schema.parse(args);

      const result = await client.inspectProject(params.projectName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'destroy_project': {
      const schema = z.object({
        projectName: z.string().min(1),
        confirm: z.literal(true, {
          errorMap: () => ({ message: 'You must set confirm=true to delete a project' }),
        }),
      });
      const params = schema.parse(args);

      const result = await client.destroyProject(params.projectName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Project '${params.projectName}' and all its services have been deleted`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown project tool: ${name}`);
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
