/**
 * MCP Tools for EasyPanel Monitoring Operations
 * Provides system-wide monitoring, Docker stats, and performance metrics
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getClient } from '../api/client.js';

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to calculate percentage
function calculatePercentage(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((used / total) * 100);
}

// Helper to aggregate performance metrics
function aggregateMetrics(data: any[]): { avg: number; min: number; max: number; p95: number; p99: number } {
  if (!data || data.length === 0) {
    return { avg: 0, min: 0, max: 0, p95: 0, p99: 0 };
  }

  const sorted = [...data].sort((a, b) => a - b);
  const sum = data.reduce((acc, val) => acc + val, 0);

  return {
    avg: Math.round(sum / data.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)]
  };
}

export const monitoringTools: Record<string, Tool> = {
  get_advanced_stats: {
    name: 'get_advanced_stats',
    description: 'Get comprehensive system-wide monitoring statistics with performance metrics aggregations',
    inputSchema: {
      type: 'object',
      properties: {
        include_history: {
          type: 'boolean',
          description: 'Include historical data for trend analysis',
          default: false
        },
        time_range: {
          type: 'string',
          description: 'Time range for historical data (e.g., 1h, 24h, 7d)',
          enum: ['1h', '6h', '24h', '7d', '30d']
        },
        aggregate_by: {
          type: 'string',
          description: 'How to aggregate historical data',
          enum: ['minute', 'hour', 'day'],
          default: 'hour'
        }
      }
    }
  },

  get_system_stats: {
    name: 'get_system_stats',
    description: 'Get real-time system resource usage (CPU, memory, disk, network)',
    inputSchema: {
      type: 'object',
      properties: {
        refresh_rate: {
          type: 'number',
          description: 'Refresh rate in seconds for continuous monitoring',
          minimum: 1,
          maximum: 300
        },
        include_processes: {
          type: 'boolean',
          description: 'Include top processes by resource usage',
          default: true
        },
        include_network: {
          type: 'boolean',
          description: 'Include network interface statistics',
          default: true
        }
      }
    }
  },

  get_docker_task_stats: {
    name: 'get_docker_task_stats',
    description: 'Get Docker container statistics and resource utilization',
    inputSchema: {
      type: 'object',
      properties: {
        project_filter: {
          type: 'string',
          description: 'Filter by specific project name'
        },
        service_filter: {
          type: 'string',
          description: 'Filter by specific service name'
        },
        include_stopped: {
          type: 'boolean',
          description: 'Include stopped containers',
          default: false
        },
        sort_by: {
          type: 'string',
          description: 'Sort containers by metric',
          enum: ['name', 'cpu', 'memory', 'network_in', 'network_out'],
          default: 'name'
        },
        order: {
          type: 'string',
          description: 'Sort order',
          enum: ['asc', 'desc'],
          default: 'asc'
        }
      }
    }
  },

  get_monitor_table_data: {
    name: 'get_monitor_table_data',
    description: 'Get formatted monitoring data suitable for dashboard displays',
    inputSchema: {
      type: 'object',
      properties: {
        table_type: {
          type: 'string',
          description: 'Type of monitoring table',
          enum: ['overview', 'services', 'resources', 'performance'],
          default: 'overview'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of rows to return',
          minimum: 1,
          maximum: 100,
          default: 20
        },
        include_health: {
          type: 'boolean',
          description: 'Include health status and alerts',
          default: true
        },
        include_trends: {
          type: 'boolean',
          description: 'Include trend indicators',
          default: true
        }
      }
    }
  }
};

// Handler for monitoring tools
export async function handleMonitoringTool(toolName: string, args: any): Promise<any> {
  const client = getClient();

  try {
    switch (toolName) {
      case 'get_advanced_stats': {
        const stats = await client.getAdvancedStats() as any;

        // Add performance aggregations and formatting
        const enhancedStats: any = {
          ...stats,
          performance_metrics: stats.performance_metrics ? {
            cpu: aggregateMetrics(stats.performance_metrics.cpu_history || []),
            memory: aggregateMetrics(stats.performance_metrics.memory_history || []),
            disk_io: aggregateMetrics(stats.performance_metrics.disk_io_history || []),
            network: aggregateMetrics(stats.performance_metrics.network_history || []),
            response_time: aggregateMetrics(stats.performance_metrics.response_time_history || [])
          } : {},
          formatted_data: {
            total_memory: stats.total_memory ? formatBytes(stats.total_memory) : 'N/A',
            used_memory: stats.used_memory ? formatBytes(stats.used_memory) : 'N/A',
            total_disk: stats.total_disk ? formatBytes(stats.total_disk) : 'N/A',
            used_disk: stats.used_disk ? formatBytes(stats.used_disk) : 'N/A',
            memory_utilization: stats.used_memory && stats.total_memory
              ? `${calculatePercentage(stats.used_memory, stats.total_memory)}%`
              : 'N/A',
            disk_utilization: stats.used_disk && stats.total_disk
              ? `${calculatePercentage(stats.used_disk, stats.total_disk)}%`
              : 'N/A',
            uptime: stats.uptime ? `${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m` : 'N/A'
          },
          alerts: stats.alerts || [],
          last_updated: new Date().toISOString()
        };

        if (args.include_history && args.time_range) {
          enhancedStats.historical_data = {
            time_range: args.time_range,
            aggregated_by: args.aggregate_by || 'hour',
            // Placeholder for actual historical data
            series: stats.historical_series || []
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(enhancedStats, null, 2)
            }
          ]
        };
      }

      case 'get_system_stats': {
        const stats = await client.getSystemStats() as any;

        // Format and enhance system statistics
        const enhancedStats: any = {
          ...stats,
          formatted_data: {
            cpu: {
              usage: stats?.cpu?.usage ? `${stats.cpu.usage}%` : 'N/A',
              cores: stats?.cpu?.cores || 'N/A',
              load_average: stats?.cpu?.load_average
                ? stats.cpu.load_average.map((load: number) => load.toFixed(2)).join(', ')
                : 'N/A'
            },
            memory: {
              total: stats?.memory?.total ? formatBytes(stats.memory.total) : 'N/A',
              used: stats?.memory?.used ? formatBytes(stats.memory.used) : 'N/A',
              free: stats?.memory?.free ? formatBytes(stats.memory.free) : 'N/A',
              usage: stats?.memory?.usage ? `${stats.memory.usage}%` : 'N/A',
              buffers: stats?.memory?.buffers ? formatBytes(stats.memory.buffers) : 'N/A',
              cached: stats?.memory?.cached ? formatBytes(stats.memory.cached) : 'N/A'
            },
            disk: {
              total: stats?.disk?.total ? formatBytes(stats.disk.total) : 'N/A',
              used: stats?.disk?.used ? formatBytes(stats.disk.used) : 'N/A',
              free: stats?.disk?.free ? formatBytes(stats.disk.free) : 'N/A',
              usage: stats?.disk?.usage ? `${stats.disk.usage}%` : 'N/A',
              read_speed: stats?.disk?.read_speed ? `${formatBytes(stats.disk.read_speed)}/s` : 'N/A',
              write_speed: stats?.disk?.write_speed ? `${formatBytes(stats.disk.write_speed)}/s` : 'N/A'
            },
            network: args.include_network && stats?.network ? {
              interfaces: stats.network.interfaces?.map((iface: any) => ({
                name: iface.name,
                rx_bytes: formatBytes(iface.rx_bytes),
                tx_bytes: formatBytes(iface.tx_bytes),
                rx_speed: iface.rx_speed ? `${formatBytes(iface.rx_speed)}/s` : 'N/A',
                tx_speed: iface.tx_speed ? `${formatBytes(iface.tx_speed)}/s` : 'N/A'
              })) || []
            } : null,
            uptime: stats?.uptime ? `${Math.floor(stats.uptime / 86400)}d ${Math.floor((stats.uptime % 86400) / 3600)}h` : 'N/A',
            timestamp: new Date().toISOString()
          },
          top_processes: args.include_processes && stats?.top_processes
            ? stats.top_processes.map((proc: any) => ({
                pid: proc.pid,
                name: proc.name,
                cpu: `${proc.cpu}%`,
                memory: `${proc.memory}%`,
                memory_mb: proc.memory_mb ? `${proc.memory_mb}MB` : 'N/A'
              }))
            : []
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(enhancedStats, null, 2)
            }
          ]
        };
      }

      case 'get_docker_task_stats': {
        const stats = await client.getDockerTaskStats() as any;

        // Process and format Docker container statistics
        let containers = stats.containers || [];

        // Apply filters
        if (args.project_filter) {
          containers = containers.filter((c: any) => c.project === args.project_filter);
        }
        if (args.service_filter) {
          containers = containers.filter((c: any) => c.service === args.service_filter);
        }
        if (!args.include_stopped) {
          containers = containers.filter((c: any) => c.state === 'running');
        }

        // Sort containers
        const sortBy = args.sort_by || 'name';
        const order = args.order || 'asc';
        containers.sort((a: any, b: any) => {
          let aVal = a[sortBy] || 0;
          let bVal = b[sortBy] || 0;

          if (typeof aVal === 'string') aVal = aVal.toLowerCase();
          if (typeof bVal === 'string') bVal = bVal.toLowerCase();

          return order === 'desc' ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
        });

        // Format container data
        const formattedContainers = containers.map((container: any) => ({
          id: container.id.substring(0, 12),
          name: container.name,
          project: container.project,
          service: container.service,
          state: container.state,
          status: container.status,
          health: container.health || 'unknown',
          uptime: container.uptime || 'N/A',
          resources: {
            cpu: container.cpu ? `${container.cpu}%` : 'N/A',
            memory: {
              used: container.memory_used ? formatBytes(container.memory_used) : 'N/A',
              limit: container.memory_limit ? formatBytes(container.memory_limit) : 'N/A',
              usage: container.memory_used && container.memory_limit
                ? `${calculatePercentage(container.memory_used, container.memory_limit)}%`
                : 'N/A'
            },
            network: container.network ? {
              rx: container.network.rx ? formatBytes(container.network.rx) : 'N/A',
              tx: container.network.tx ? formatBytes(container.network.tx) : 'N/A'
            } : null
          },
          restarts: container.restarts || 0,
          created: container.created,
          image: container.image
        }));

        const summary = {
          total_containers: containers.length,
          running: containers.filter((c: any) => c.state === 'running').length,
          stopped: containers.filter((c: any) => c.state === 'stopped').length,
          unhealthy: containers.filter((c: any) => c.health === 'unhealthy').length,
          total_memory_usage: containers.reduce((sum: number, c: any) => sum + (c.memory_used || 0), 0),
          average_cpu: containers.length > 0
            ? containers.reduce((sum: number, c: any) => sum + (c.cpu || 0), 0) / containers.length
            : 0
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                summary: {
                  ...summary,
                  total_memory_usage: formatBytes(summary.total_memory_usage),
                  average_cpu: `${summary.average_cpu.toFixed(1)}%`
                },
                containers: formattedContainers,
                last_updated: new Date().toISOString()
              }, null, 2)
            }
          ]
        };
      }

      case 'get_monitor_table_data': {
        const data = await client.getMonitorTableData() as any;

        // Format data based on table type
        let tableData: any = {
          table_type: args.table_type || 'overview',
          last_updated: new Date().toISOString()
        };

        switch (args.table_type) {
          case 'overview':
            tableData = {
              ...tableData,
              system_overview: {
                uptime: data.uptime ? `${Math.floor(data.uptime / 3600)}h ${Math.floor((data.uptime % 3600) / 60)}m` : 'N/A',
                cpu_usage: data.cpu_usage ? `${data.cpu_usage}%` : 'N/A',
                memory_usage: data.memory_usage ? `${data.memory_usage}%` : 'N/A',
                disk_usage: data.disk_usage ? `${data.disk_usage}%` : 'N/A',
                load_average: data.load_average ? data.load_average.map((l: number) => l.toFixed(2)).join(', ') : 'N/A'
              },
              quick_stats: {
                total_projects: data.total_projects || 0,
                running_services: data.running_services || 0,
                total_containers: data.total_containers || 0,
                network_io: data.network_io ? {
                  rx: formatBytes(data.network_io.rx),
                  tx: formatBytes(data.network_io.tx)
                } : null
              }
            };
            if (args.include_health) {
              tableData.health_status = {
                overall: data.health_status || 'healthy',
                alerts: data.alerts || [],
                last_check: data.last_health_check || new Date().toISOString()
              };
            }
            if (args.include_trends) {
              tableData.trends = data.trends || {
                cpu: 'stable',
                memory: 'stable',
                disk: 'stable',
                network: 'stable'
              };
            }
            break;

          case 'services':
            tableData.services = (data.services || []).slice(0, args.limit || 20).map((service: any) => ({
              name: service.name,
              project: service.project,
              status: service.status,
              cpu: `${service.cpu || 0}%`,
              memory: formatBytes(service.memory || 0),
              uptime: service.uptime || 'N/A',
              restarts: service.restarts || 0,
              health: service.health || 'unknown',
              image: service.image
            }));
            if (args.include_health) {
              tableData.services.forEach((s: any) => {
                s.health_details = s.health_details || null;
              });
            }
            break;

          case 'resources':
            tableData.resources = {
              cpu: {
                usage: data.cpu?.usage ? `${data.cpu.usage}%` : 'N/A',
                cores: data.cpu?.cores || 'N/A',
                load: data.cpu?.load_average ? data.cpu.load_average.map((l: number) => l.toFixed(2)).join(', ') : 'N/A'
              },
              memory: {
                total: data.memory?.total ? formatBytes(data.memory.total) : 'N/A',
                used: data.memory?.used ? formatBytes(data.memory.used) : 'N/A',
                free: data.memory?.free ? formatBytes(data.memory.free) : 'N/A',
                usage: data.memory?.usage ? `${data.memory.usage}%` : 'N/A'
              },
              disk: {
                total: data.disk?.total ? formatBytes(data.disk.total) : 'N/A',
                used: data.disk?.used ? formatBytes(data.disk.used) : 'N/A',
                free: data.disk?.free ? formatBytes(data.disk.free) : 'N/A',
                usage: data.disk?.usage ? `${data.disk.usage}%` : 'N/A'
              },
              network: data.network?.interfaces?.slice(0, args.limit || 20).map((iface: any, idx: number) => ({
                interface: iface.name || `eth${idx}`,
                rx: formatBytes(iface.rx_bytes || 0),
                tx: formatBytes(iface.tx_bytes || 0),
                rx_speed: iface.rx_speed ? `${formatBytes(iface.rx_speed)}/s` : 'N/A',
                tx_speed: iface.tx_speed ? `${formatBytes(iface.tx_speed)}/s` : 'N/A'
              })) || []
            };
            break;

          case 'performance':
            tableData.performance = {
              response_times: data.performance?.response_times ? aggregateMetrics(data.performance.response_times) : null,
              throughput: data.performance?.throughput || 'N/A',
              error_rate: data.performance?.error_rate ? `${(data.performance.error_rate * 100).toFixed(2)}%` : 'N/A',
              concurrent_connections: data.performance?.concurrent_connections || 0,
              request_rate: data.performance?.request_rate ? `${data.performance.request_rate}/s` : 'N/A'
            };
            if (args.include_trends) {
              tableData.performance.trends = data.performance?.trends || {
                response_time: 'stable',
                throughput: 'stable',
                error_rate: 'stable'
              };
            }
            break;
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(tableData, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown monitoring tool: ${toolName}`);
    }
  } catch (error) {
    console.error(`[Monitoring Tool Error] ${toolName}:`, error);

    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: message }, null, 2)
        }
      ]
    };
  }
}