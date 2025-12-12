# MCP EasyPanel Server - Improvements & Roadmap

## Current Issues Found

### 1. Timeout on Deploy Operations
- **Problem**: Deploy operations timeout after 30s, but builds can take 2-5 minutes
- **Solution**: Implement async deployment with status polling
```typescript
// Instead of waiting for deploy to complete:
async deployService() → returns immediately with build ID
async getBuildStatus(buildId) → poll for completion
```

### 2. Dockerfile Parameter Ignored
- **Problem**: EasyPanel API ignores `dockerfile` parameter in `updateSourceDockerfile`
- **Workaround**: Always use `Dockerfile` as the main file name
- **Feature Request**: Support for specifying custom Dockerfile names

### 3. No Build Logs Access
- **Problem**: When build fails, no way to retrieve build logs via API
- **Solution**: Add `getBuildLogs(projectName, serviceName)` tool

## Missing Features to Add

### High Priority
1. **Domain Management**
   - `addDomain(projectName, serviceName, domain, port, https)`
   - `removeDomain(projectName, serviceName, domainId)`
   - `listDomains(projectName, serviceName)`

2. **Build Logs**
   - `getBuildLogs(projectName, serviceName, lines?)`
   - `streamBuildLogs(projectName, serviceName)` - real-time

3. **Container Logs**
   - `getServiceLogs(projectName, serviceName, lines?, since?)`

### Medium Priority
4. **Volume Management**
   - `addMount(projectName, serviceName, path, type)`
   - `removeMount(projectName, serviceName, mountId)`

5. **Port Configuration**
   - `exposePort(projectName, serviceName, containerPort, hostPort?)`
   - `updatePort(projectName, serviceName, port, settings)`

6. **Scaling**
   - `scaleService(projectName, serviceName, replicas)`

### Nice to Have
7. **Backup & Restore**
   - `backupDatabase(projectName, serviceName)`
   - `restoreDatabase(projectName, serviceName, backupId)`

8. **SSL Certificates**
   - `renewCertificate(projectName, serviceName, domain)`
   - `getCertificateStatus(projectName, serviceName, domain)`

## Code Optimizations

### 1. Add Retry Logic
```typescript
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

### 2. Add Request Caching
- Cache `listProjects` and `inspectProject` for 30s
- Invalidate cache on mutations

### 3. Better Error Messages
```typescript
// Current: "EasyPanel API Error: timeout"
// Better: "Deploy timeout after 30s. Build may still be in progress.
//          Use get_service_stats to check status."
```

### 4. Add Input Validation
- Validate project/service names before API calls
- Check for valid Docker image formats
- Validate environment variable syntax

## Usage Examples

### Deploy a Next.js App
```
1. create_app_service(project, "my-app")
2. update_env(project, "my-app", "NODE_ENV=production\nPORT=3000")
3. deploy_from_git(project, "my-app", "https://github.com/user/repo.git")
4. [via UI] Add domain and configure port 3000
```

### Create Full Stack with Database
```
1. create_project("myproject")
2. create_postgres(project, "db", "mydb", "user", "pass")
3. create_app_service(project, "api")
4. update_env with DATABASE_URL pointing to internal postgres
5. deploy_from_git for the API
```

## API Endpoints to Research

These EasyPanel API endpoints need investigation:
- `domains.*` - Domain management
- `monitor.getLogs` - Container logs
- `services.app.getBuildLogs` - Build logs
- `services.app.updatePorts` - Port configuration
- `backups.*` - Backup management

## Testing Checklist

- [ ] Test with private GitHub repos (with token in URL)
- [ ] Test timeout handling for long builds
- [ ] Test error recovery on network failures
- [ ] Test concurrent operations on same project
- [ ] Test all database types (Redis, MySQL, PostgreSQL)
