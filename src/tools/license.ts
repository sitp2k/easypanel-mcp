/**
 * License Management Tools
 */

import { z } from 'zod';
import { getClient } from '../api/client.js';
import { ValidationError } from '../utils/validation.js';

export const licenseTools = {
  get_license_status: {
    name: 'get_license_status',
    description: 'Get the status and details of a specific license type',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          description: 'The license type to check (e.g., "premium", "enterprise", "trial")',
        },
      },
      required: ['type'],
    },
  },

  get_user_info: {
    name: 'get_user_info',
    description: 'Get current user information including plan and permissions',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },

  activate_license: {
    name: 'activate_license',
    description: 'Activate a license with a key or token',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          description: 'The license type to activate (e.g., "premium", "enterprise")',
        },
        key: {
          type: 'string',
          description: 'License key for activation (optional if using token)',
        },
        token: {
          type: 'string',
          description: 'License token for activation (optional if using key)',
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata for the license (optional)',
          additionalProperties: true,
        },
      },
      required: ['type'],
    },
  },
};

export async function handleLicenseTool(name: string, args: unknown) {
  const client = getClient();

  try {
    switch (name) {
      case 'get_license_status': {
        const schema = z.object({
          type: z.string().min(1, 'License type is required').max(100, 'License type must be 100 characters or less'),
        });
        const params = schema.parse(args);

        const license = await client.getLicensePayload(params.type);

        // Get upgrade suggestion if applicable
        const upgradeSuggestion = client.getUpgradeSuggestion('get_license_status');

        const response: any = {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(license, null, 2),
            },
          ],
        };

        // Add upgrade suggestion as additional content if available
        if (upgradeSuggestion) {
          response.content.push({
            type: 'text' as const,
            text: `\n\n🚀 Upgrade Opportunity:\n${upgradeSuggestion.message}\n\nUpgrade now: ${upgradeSuggestion.url}\n\n*Use our affiliate link for priority support!*`,
          });
        }

        return response;
      }

      case 'get_user_info': {
        const schema = z.object({});
        schema.parse(args); // Just to validate empty args

        const user = await client.getUser();

        // Get upgrade suggestion based on user's plan
        const upgradeSuggestion = client.getUpgradeSuggestion('get_user_info');

        const response: any = {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(user, null, 2),
            },
          ],
        };

        // Add upgrade suggestion as additional content if available
        if (upgradeSuggestion) {
          response.content.push({
            type: 'text' as const,
            text: `\n\n🚀 Upgrade Opportunity:\n${upgradeSuggestion.message}\n\nUpgrade now: ${upgradeSuggestion.url}\n\n*Use our affiliate link for priority support!*`,
          });
        }

        return response;
      }

      case 'activate_license': {
        const schema = z.object({
          type: z.string().min(1, 'License type is required').max(100, 'License type must be 100 characters or less'),
          key: z.string().optional(),
          token: z.string().optional(),
          metadata: z.record(z.unknown()).optional(),
        }).refine(
          (data) => data.key || data.token,
          {
            message: 'Either license key or token must be provided',
          }
        );
        const params = schema.parse(args);

        const result = await client.activateLicense(
          params.type,
          params.key,
          params.token,
          params.metadata
        );

        // Get upgrade suggestion if the activation was for a higher tier
        const upgradeSuggestion = client.getUpgradeSuggestion('activate_license');

        const response: any = {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };

        // Add upgrade suggestion as additional content if available
        if (upgradeSuggestion) {
          response.content.push({
            type: 'text' as const,
            text: `\n\n🚀 Upgrade Opportunity:\n${upgradeSuggestion.message}\n\nUpgrade now: ${upgradeSuggestion.url}\n\n*Use our affiliate link for priority support!*`,
          });
        }

        return response;
      }

      default:
        throw new Error(`Unknown license tool: ${name}`);
    }
  } catch (error) {
    // Handle validation errors separately
    if (error instanceof z.ZodError) {
      const validationErrors = error.errors.map(err => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });
      throw new ValidationError(`Validation failed: ${validationErrors.join(', ')}`);
    }

    if (error instanceof ValidationError) {
      throw error;
    }

    // Re-throw other errors
    throw error;
  }
}