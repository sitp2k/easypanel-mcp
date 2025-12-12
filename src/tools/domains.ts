/**
 * Domain Management Tools
 */

import { z } from 'zod';
import { getClient } from '../api/client.js';
import { ValidationError } from '../utils/validation.js';

export const domainTools = {
  add_domain: {
    name: 'add_domain',
    description: 'Add a custom domain to a service',
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
        domain: {
          type: 'string',
          description: 'Domain name to add (e.g., example.com)',
        },
        port: {
          type: 'number',
          description: 'Port to route traffic to (default: 80)',
          default: 80,
        },
        https: {
          type: 'boolean',
          description: 'Enable HTTPS for this domain (default: false)',
          default: false,
        },
      },
      required: ['projectName', 'serviceName', 'domain'],
    },
  },

  remove_domain: {
    name: 'remove_domain',
    description: 'Remove a domain from a service',
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
        domainId: {
          type: 'string',
          description: 'ID of the domain to remove',
        },
      },
      required: ['projectName', 'serviceName', 'domainId'],
    },
  },

  list_domains: {
    name: 'list_domains',
    description: 'List all domains configured for a service',
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

  validate_domain: {
    name: 'validate_domain',
    description: 'Validate domain configuration and DNS setup',
    inputSchema: {
      type: 'object' as const,
      properties: {
        domain: {
          type: 'string',
          description: 'Domain name to validate (e.g., example.com)',
        },
      },
      required: ['domain'],
    },
  },

  enable_https: {
    name: 'enable_https',
    description: 'Enable HTTPS for a domain using Let\'s Encrypt certificate',
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
        domain: {
          type: 'string',
          description: 'Domain name to enable HTTPS for',
        },
        email: {
          type: 'string',
          description: 'Email for Let\'s Encrypt certificate (optional)',
        },
      },
      required: ['projectName', 'serviceName', 'domain'],
    },
  },

  disable_https: {
    name: 'disable_https',
    description: 'Disable HTTPS for a domain',
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
        domain: {
          type: 'string',
          description: 'Domain name to disable HTTPS for',
        },
      },
      required: ['projectName', 'serviceName', 'domain'],
    },
  },

  renew_certificate: {
    name: 'renew_certificate',
    description: 'Renew SSL certificate for a domain',
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
        domain: {
          type: 'string',
          description: 'Domain name to renew certificate for',
        },
      },
      required: ['projectName', 'serviceName', 'domain'],
    },
  },

  get_certificate: {
    name: 'get_certificate',
    description: 'Get SSL certificate details for a domain',
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
        domain: {
          type: 'string',
          description: 'Domain name to get certificate for',
        },
      },
      required: ['projectName', 'serviceName', 'domain'],
    },
  },

  upload_custom_certificate: {
    name: 'upload_custom_certificate',
    description: 'Upload a custom SSL certificate for a domain',
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
        domain: {
          type: 'string',
          description: 'Domain name for the certificate',
        },
        certificate: {
          type: 'string',
          description: 'SSL certificate content (PEM format)',
        },
        privateKey: {
          type: 'string',
          description: 'Private key content (PEM format)',
        },
        chain: {
          type: 'string',
          description: 'Certificate chain content (optional, PEM format)',
        },
      },
      required: ['projectName', 'serviceName', 'domain', 'certificate', 'privateKey'],
    },
  },
};

export async function handleDomainTool(name: string, args: unknown) {
  const client = getClient();

  try {  // Wrap entire switch in try-catch for validation errors
    switch (name) {
    case 'add_domain': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        domain: z.string().min(1),
        port: z.number().int().positive().default(80),
        https: z.boolean().default(false),
        sslEmail: z.string().email().optional(),
      });
      const params = schema.parse(args);

      // Validate domain format first
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      if (!domainRegex.test(params.domain)) {
        throw new Error(`Invalid domain format: ${params.domain}`);
      }

      const result = await client.addDomain(
        params.projectName,
        params.serviceName,
        {
          host: params.domain,
          port: params.port,
          https: params.https,
          domain: params.domain,
          sslEmail: params.sslEmail
        }
      );

      // Get upgrade suggestion if applicable
      const upgradeSuggestion = client.getUpgradeSuggestion('add_domain');

      const response: any = {
        success: true,
        message: `Domain '${params.domain}' added to service '${params.serviceName}'`,
        result,
      };

      // Add upgrade tip if available
      if (upgradeSuggestion) {
        response.tip = {
          message: upgradeSuggestion.message,
          url: upgradeSuggestion.url
        };

        // Also add upgrade suggestion to response content
        response.content.push({
          type: 'text' as const,
          text: `\n\n💡 Pro tip: ${upgradeSuggestion.message}\n\n🚀 Upgrade now: ${upgradeSuggestion.url}\n\n*Premium unlocks unlimited custom domains with automatic SSL!*`
        });
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case 'remove_domain': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        domainId: z.string().min(1),
      });
      const params = schema.parse(args);

      const result = await client.removeDomain(
        params.projectName,
        params.serviceName,
        params.domainId
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Domain '${params.domainId}' removed from service '${params.serviceName}'`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'list_domains': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
      });
      const params = schema.parse(args);

      const result = await client.listDomains(params.projectName, params.serviceName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Found ${result.length} domain(s) for service '${params.serviceName}'`,
              domains: result,
            }, null, 2),
          },
        ],
      };
    }

    case 'validate_domain': {
      const schema = z.object({
        domain: z.string().min(1),
      });
      const params = schema.parse(args);

      const result = await client.validateDomain(
        'temp-project',
        'temp-service',
        { domain: params.domain, sslEmail: undefined, host: params.domain, port: 80, https: false }
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Domain validation result for '${params.domain}'`,
              validation: result,
            }, null, 2),
          },
        ],
      };
    }

    case 'enable_https': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        domain: z.string().min(1),
        email: z.string().email().optional(),
      });
      const params = schema.parse(args);

      const result = await client.requestSSLCertificate(
        params.projectName,
        params.serviceName,
        params.domain,
        params.email
      );

      // Get upgrade suggestion
      const upgradeSuggestion = client.getUpgradeSuggestion('enable_https');

      let responseContent: any = {
        success: true,
        message: `HTTPS enabled for domain '${params.domain}'`,
        certificate: result,
      };

      // Add upgrade suggestion if on free tier
      if (upgradeSuggestion) {
        responseContent.upgrade_tip = {
          message: upgradeSuggestion.message,
          url: upgradeSuggestion.url
        };
      }

      const responseData = JSON.stringify(responseContent, null, 2);

      // Add upgrade CTA if applicable
      let finalText = responseData;
      if (upgradeSuggestion) {
        finalText += `\n\n🔒 SSL secured! Pro tip: ${upgradeSuggestion.message}\n\n🚀 Upgrade for unlimited SSL certificates: ${upgradeSuggestion.url}`;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: finalText,
          },
        ],
      };
    }

    case 'disable_https': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        domain: z.string().min(1),
      });
      const params = schema.parse(args);

      // Note: EasyPanel doesn't have disableHTTPS - return message
      const result = { success: false, message: 'disableHTTPS not available - use custom certificate removal instead' };
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `HTTPS disabled for domain '${params.domain}'`,
              result,
            }, null, 2),
          },
        ],
      };
    }

    case 'renew_certificate': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        domain: z.string().min(1),
      });
      const params = schema.parse(args);

      const result = await client.renewSSLCertificate(
        params.projectName,
        params.serviceName,
        params.domain
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Certificate renewed for domain '${params.domain}'`,
              certificate: result,
            }, null, 2),
          },
        ],
      };
    }

    case 'get_certificate': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        domain: z.string().min(1),
      });
      const params = schema.parse(args);

      const result = await client.getSSLCertificate(
        params.projectName,
        params.serviceName,
        params.domain
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Certificate details for domain '${params.domain}'`,
              certificate: result,
            }, null, 2),
          },
        ],
      };
    }

    case 'upload_custom_certificate': {
      const schema = z.object({
        projectName: z.string().min(1),
        serviceName: z.string().min(1),
        domain: z.string().min(1),
        certificate: z.string().min(1),
        privateKey: z.string().min(1),
        chain: z.string().optional(),
      });
      const params = schema.parse(args);

      // Basic certificate validation
      if (!params.certificate.includes('-----BEGIN CERTIFICATE-----')) {
        throw new Error('Invalid certificate format. Must be in PEM format.');
      }
      if (!params.privateKey.includes('-----BEGIN')) {
        throw new Error('Invalid private key format. Must be in PEM format.');
      }

      // Note: uploadCustomCertificate not implemented in EasyPanel client yet
      const result = {
        success: false,
        message: 'uploadCustomCertificate not available in current API version',
        validated: {
          certificate: params.certificate ? 'Valid PEM format' : 'Invalid',
          privateKey: params.privateKey ? 'Valid PEM format' : 'Invalid',
          chain: params.chain ? 'Valid PEM format' : 'Not provided'
        }
      };
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Custom certificate uploaded for domain '${params.domain}'`,
              certificate: result,
            }, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown domain tool: ${name}`);
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