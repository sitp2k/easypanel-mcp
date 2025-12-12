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

  docker_cleanup_containers: {
    name: 'docker_cleanup_containers',
    description: 'Remove stopped Docker containers',
    inputSchema: {
      type: 'object' as const,
      properties: {
        force: {
          type: 'boolean',
          description: 'Force removal of containers (default: false)',
        },
      },
    },
  },

  docker_volumes_cleanup: {
    name: 'docker_volumes_cleanup',
    description: 'Clean orphaned Docker volumes',
    inputSchema: {
      type: 'object' as const,
      properties: {
        force: {
          type: 'boolean',
          description: 'Force removal of volumes (default: false)',
        },
      },
    },
  },

  docker_system_prune: {
    name: 'docker_system_prune',
    description: 'Comprehensive Docker system cleanup - removes all unused data',
    inputSchema: {
      type: 'object' as const,
      properties: {
        force: {
          type: 'boolean',
          description: 'Force removal of all unused data (default: false)',
        },
        all: {
          type: 'boolean',
          description: 'Remove all unused images, not just dangling ones (default: false)',
        },
      },
    },
  },

  docker_cleanup_by_project: {
    name: 'docker_cleanup_by_project',
    description: 'Clean Docker resources for a specific project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project to cleanup',
        },
        volumes: {
          type: 'boolean',
          description: 'Also cleanup volumes (default: false)',
        },
        images: {
          type: 'boolean',
          description: 'Also cleanup images (default: false)',
        },
      },
      required: ['projectName'],
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

export async function handleDockerCleanupContainers(args: { force?: boolean }, sessionId?: string) {
  const client = getClient();

  try {
    // Validate input
    const schema = z.object({
      force: z.boolean().optional().default(false),
    });
    const validated = schema.parse(args);

    // Execute Docker container cleanup with progress reporting
    return await runWithProgress(sessionId, 'docker_cleanup_containers', async (report) => {
      report(10, 'Starting container cleanup...');

      // Execute Docker container cleanup
      const result = await client.dockerContainerCleanup(validated.force);

      report(80, 'Cleaning up stopped containers...');

      return {
        success: true,
        message: `Removed stopped Docker containers successfully`,
        data: {
          containers_removed: result.containersRemoved || 0,
          freed_space: result.freedSpace || 'Unknown',
          warnings: result.warnings || [],
        },
      };
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new Error(`Failed to cleanup Docker containers: ${error.message}`);
  }
}

export async function handleDockerVolumesCleanup(args: { force?: boolean }, sessionId?: string) {
  const client = getClient();

  try {
    // Validate input
    const schema = z.object({
      force: z.boolean().optional().default(false),
    });
    const validated = schema.parse(args);

    // Execute Docker volumes cleanup with progress reporting
    return await runWithProgress(sessionId, 'docker_volumes_cleanup', async (report) => {
      report(10, 'Starting Docker volumes cleanup...');

      // Execute Docker volumes cleanup
      const result = await client.dockerVolumeCleanup(validated.force);

      report(80, 'Removing orphaned volumes...');

      return {
        success: true,
        message: `Cleaned orphaned Docker volumes successfully`,
        data: {
          volumes_removed: result.volumesRemoved || 0,
          freed_space: result.freedSpace || 'Unknown',
          warnings: result.warnings || [],
        },
      };
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new Error(`Failed to cleanup Docker volumes: ${error.message}`);
  }
}

export async function handleDockerSystemPrune(args: { force?: boolean; all?: boolean }, sessionId?: string) {
  const client = getClient();

  try {
    // Validate input
    const schema = z.object({
      force: z.boolean().optional().default(false),
      all: z.boolean().optional().default(false),
    });
    const validated = schema.parse(args);

    // Execute comprehensive Docker system prune with progress reporting
    return await runWithProgress(sessionId, 'docker_system_prune', async (report) => {
      report(10, 'Starting Docker system prune...');

      // Execute comprehensive Docker system prune
      const result = await client.dockerSystemPrune(validated.force, validated.all);

      report(90, 'Finalizing system cleanup...');

      return {
        success: true,
        message: `Docker system pruned successfully`,
        data: {
          total_reclaimed_space: result.totalReclaimedSpace || 'Unknown',
          containers_removed: result.containersRemoved || 0,
          images_removed: result.imagesRemoved || 0,
          volumes_removed: result.volumesRemoved || 0,
          networks_removed: result.networksRemoved || 0,
          build_cache_reclaimed: result.buildCacheReclaimed || 'Unknown',
          warnings: result.warnings || [],
        },
      };
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new Error(`Failed to perform Docker system prune: ${error.message}`);
  }
}

export async function handleDockerCleanupByProject(args: {
  projectName: string;
  volumes?: boolean;
  images?: boolean;
}, sessionId?: string) {
  const client = getClient();

  try {
    // Validate input
    const schema = z.object({
      projectName: z.string().min(1).refine(validateProjectServiceNameWithRefine('project'), {
        message: 'Project name must be 2-64 characters, lowercase alphanumeric, hyphens, or underscores, and start with a letter or number',
      }),
      volumes: z.boolean().optional().default(false),
      images: z.boolean().optional().default(false),
    });
    const validated = schema.parse(args);

    // Execute project-specific Docker cleanup with progress reporting
    return await runWithProgress(sessionId, 'docker_cleanup_by_project', async (report) => {
      report(10, `Starting cleanup for project: ${validated.projectName}...`);

      // Execute project-specific Docker cleanup
      const result = await client.dockerProjectCleanup(
        validated.projectName,
        validated.volumes,
        validated.images
      );

      report(90, 'Finalizing project cleanup...');

      return {
        success: true,
        message: `Cleaned Docker resources for project '${validated.projectName}'`,
        data: {
          project: validated.projectName,
          containers_removed: result.containersRemoved || 0,
          volumes_removed: validated.volumes ? (result.volumesRemoved || 0) : 0,
          images_removed: validated.images ? (result.imagesRemoved || 0) : 0,
          freed_space: result.freedSpace || 'Unknown',
          warnings: result.warnings || [],
        },
      };
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new Error(`Failed to cleanup Docker resources for project: ${error.message}`);
  }
}