/**
 * Web IDE Integration Example for MCP EasyPanel Server
 * JavaScript/TypeScript client for web-based IDEs
 */

class EasyPanelWebClient {
  constructor(baseUrl = 'http://localhost:3002/api') {
    this.baseUrl = baseUrl;
    this.sessionId = this.generateSessionId();
  }

  generateSessionId() {
    return 'web_session_' + Math.random().toString(36).substr(2, 9);
  }

  async makeRequest(endpoint, method = 'POST', data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-MCP-Session-ID': this.sessionId,
      'X-Client-Name': 'web'
    };

    try {
      const options = {
        method,
        headers
      };

      if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error.message
        }
      };
    }
  }

  // Core API methods
  async healthCheck() {
    return this.makeRequest('/health', 'GET');
  }

  async listTools() {
    return this.makeRequest('/tools', 'GET');
  }

  async executeTool(toolName, args = {}) {
    return this.makeRequest(`/tools/${toolName}`, 'POST', args);
  }

  async batchExecute(tools) {
    return this.makeRequest('/tools/batch', 'POST', { tools });
  }

  async getClientInfo() {
    return this.makeRequest('/client', 'GET');
  }

  // EasyPanel-specific methods
  async listProjects(limit = 10, search = null) {
    const args = { limit };
    if (search) args.search = search;
    return this.executeTool('projects_list', args);
  }

  async createProject(name, domain = null) {
    const args = { name };
    if (domain) args.domain = domain;
    return this.executeTool('projects_create', args);
  }

  async listServices(project, limit = 10) {
    return this.executeTool('services_list', { project, limit });
  }

  async createService(project, name, image, ports = [], envVars = {}) {
    return this.executeTool('services_create', {
      project,
      name,
      image,
      ports,
      env_vars: envVars
    });
  }

  async deployService(project, service) {
    return this.executeTool('services_deploy', { project, service });
  }

  async listDatabases(limit = 10) {
    return this.executeTool('databases_list', { limit });
  }

  async createDatabase(name, type, project = null) {
    const args = { name, type };
    if (project) args.project = project;
    return this.executeTool('databases_create', args);
  }

  async getSystemStatus() {
    return this.executeTool('system_status');
  }

  async cleanupDocker(type = 'all') {
    const tools = {
      'images': 'docker_cleanup_images',
      'containers': 'docker_cleanup_containers',
      'volumes': 'docker_volumes_cleanup',
      'all': 'docker_system_prune'
    };
    return this.executeTool(tools[type] || tools.all);
  }

  // Real-time progress tracking
  async monitorProgress(operationId, callback) {
    const eventSource = new EventSource(
      `${this.baseUrl.replace('/api', '')}/progress/${this.sessionId}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      callback(data);
    };

    eventSource.onerror = (error) => {
      console.error('Progress monitoring error:', error);
      eventSource.close();
    };

    return eventSource;
  }
}

// Example React Hook
function useEasyPanel() {
  const [client] = useState(() => new EasyPanelWebClient());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = async (toolName, args) => {
    setLoading(true);
    setError(null);

    try {
      const result = await client.executeTool(toolName, args);
      if (!result.success) {
        setError(result.error);
        return null;
      }
      return result.data;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { client, execute, loading, error };
}

// Example Vue Composition API
function useEasyPanelVue() {
  const client = ref(new EasyPanelWebClient());
  const loading = ref(false);
  const error = ref(null);

  const execute = async (toolName, args) => {
    loading.value = true;
    error.value = null;

    try {
      const result = await client.value.executeTool(toolName, args);
      if (!result.success) {
        error.value = result.error;
        return null;
      }
      return result.data;
    } catch (err) {
      error.value = err;
      return null;
    } finally {
      loading.value = false;
    }
  };

  return { client, execute, loading, error };
}

// Example usage
async function exampleUsage() {
  const client = new EasyPanelWebClient();

  // Check health
  const health = await client.healthCheck();
  console.log('Health:', health);

  // List projects
  const projects = await client.listProjects();
  console.log('Projects:', projects);

  // Create a project
  const newProject = await client.createProject('my-web-app', 'app.example.com');
  console.log('Created project:', newProject);

  // Batch operations
  const batch = await client.batchExecute([
    { name: 'projects_list', args: { limit: 5 } },
    { name: 'services_list', args: { project: 'my-web-app', limit: 5 } },
    { name: 'system_status' }
  ]);
  console.log('Batch results:', batch);

  // Monitor progress
  const progressMonitor = await client.monitorProgress('deploy-operation', (update) => {
    console.log('Progress:', update);
  });
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS
  module.exports = { EasyPanelWebClient, useEasyPanel, useEasyPanelVue };
} else if (typeof window !== 'undefined') {
  // Browser
  window.EasyPanelWebClient = EasyPanelWebClient;
  window.useEasyPanel = useEasyPanel;
  window.useEasyPanelVue = useEasyPanelVue;
}

// Example for direct script inclusion
// <script src="easypanel-web-client.js"></script>
// const client = new EasyPanelWebClient();