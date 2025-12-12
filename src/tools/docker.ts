/**
 * Docker Cleanup and Management Tools
 */

import { z } from 'zod';
import { getClient } from '../api/client.js';
import { ValidationError, validateProjectServiceNameWithRefine } from '../utils/validation.js';
import { runWithProgress } from '../utils/progress.js';

export const dockerTools = {
  docker_cleanup_images: {
    name: 'docker_cleanup_images',
    description: 'Remove unused Docker images to free up disk space',
    inputSchema: {
      type: 'object' as const,
      properties: {
        force: {
          type: 'boolean',
          description: 'Force removal of images (default: false)',
        },
      },
    },
  },

  docker_prune_builder_cache: {
    name: 'docker_prune_builder_cache',
    description: 'Clean Docker build cache to reclaim disk space',
    inputSchema: {
      type: 'object' as const,
      properties: {
        all: {
          type: 'boolean',
          description: 'Remove all unused build cache (default: false)',
        },
      },
    },
  },
};

// Handler functions
export async function handleDockerCleanupImages(args: { force?: boolean }, sessionId?: string) {
  const client = getClient();

  try {
    // Validate input
    const schema = z.object({
      force: z.boolean().optional().default(false),
    });
    const validated = schema.parse(args);

    // Execute Docker image cleanup with progress reporting
    return await runWithProgress(sessionId, 'docker_cleanup_images', async (report) => {
      report(10, 'Starting Docker image cleanup...');

      // Execute Docker image cleanup via EasyPanel API
      const result = await client.dockerImageCleanup(validated.force);

      report(75, 'Cleaning up unused images...');

      return {
        success: true,
        message: `Removed unused Docker images successfully`,
        data: {
          freed_space: result.freedSpace || 'Unknown',
          images_removed: result.imagesRemoved || 0,
          warnings: result.warnings || [],
        },
      };
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new Error(`Failed to cleanup Docker images: ${error.message}`);
  }
}

export async function handleDockerPruneBuilderCache(args: { all?: boolean }, sessionId?: string) {
  const client = getClient();

  try {
    // Validate input
    const schema = z.object({
      all: z.boolean().optional().default(false),
    });
    const validated = schema.parse(args);

    // Execute Docker builder cache cleanup with progress reporting
    return await runWithProgress(sessionId, 'docker_prune_builder_cache', async (report) => {
      report(10, 'Pruning Docker builder cache...');

      // Execute Docker builder cache cleanup
      const result = await client.dockerBuilderCachePrune(validated.all);

      report(80, 'Finalizing cache cleanup...');

      return {
        success: true,
        message: `Docker builder cache pruned successfully`,
        data: {
          freed_space: result.freedSpace || 'Unknown',
          cache_id: result.cacheId || 'Unknown',
          warnings: result.warnings || [],
        },
      };
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new Error(`Failed to prune Docker builder cache: ${error.message}`);
  }
}

