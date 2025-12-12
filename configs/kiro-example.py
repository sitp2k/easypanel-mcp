#!/usr/bin/env python3
"""
Kiro Integration Example for MCP EasyPanel Server
Synchronous REST API client for Kiro IDE
"""

import requests
import json
from typing import Dict, List, Any, Optional

class KiroEasyPanelClient:
    """Kiro-compatible client for EasyPanel MCP Server"""

    def __init__(self, base_url: str = "http://localhost:3002/api"):
        self.base_url = base_url
        self.session_id = "kiro_session"

    def _make_request(self, endpoint: str, method: str = "POST", data: Dict = None) -> Dict:
        """Internal method to make HTTP requests"""
        url = f"{self.base_url}{endpoint}"
        headers = {
            'Content-Type': 'application/json',
            'X-MCP-Session-ID': self.session_id,
            'X-Client-Name': 'kiro'
        }

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            else:
                response = requests.post(url, headers=headers, json=data or {})

            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": {
                    "code": "NETWORK_ERROR",
                    "message": str(e)
                }
            }

    def health_check(self) -> Dict:
        """Check server health"""
        return self._make_request("/health", "GET")

    def list_tools(self) -> Dict:
        """List all available tools"""
        return self._make_request("/tools", "GET")

    def execute_tool(self, tool_name: str, args: Dict = None) -> Dict:
        """Execute a single tool"""
        return self._make_request(f"/tools/{tool_name}", "POST", args or {})

    def batch_execute(self, tools: List[Dict]) -> Dict:
        """Execute multiple tools in batch"""
        return self._make_request("/tools/batch", "POST", {"tools": tools})

    # EasyPanel-specific methods

    def list_projects(self, limit: int = 10, search: str = None) -> Dict:
        """List EasyPanel projects"""
        args = {"limit": limit}
        if search:
            args["search"] = search
        return self.execute_tool("projects_list", args)

    def create_project(self, name: str, domain: str = None) -> Dict:
        """Create a new project"""
        args = {"name": name}
        if domain:
            args["domain"] = domain
        return self.execute_tool("projects_create", args)

    def list_services(self, project: str, limit: int = 10) -> Dict:
        """List services in a project"""
        return self.execute_tool("services_list", {"project": project, "limit": limit})

    def create_service(self, project: str, name: str, image: str,
                      ports: List[str] = None, env_vars: Dict = None) -> Dict:
        """Create a new service"""
        args = {
            "project": project,
            "name": name,
            "image": image
        }
        if ports:
            args["ports"] = ports
        if env_vars:
            args["env_vars"] = env_vars
        return self.execute_tool("services_create", args)

    def deploy_service(self, project: str, service: str) -> Dict:
        """Deploy a service"""
        return self.execute_tool("services_deploy", {
            "project": project,
            "service": service
        })

    def list_databases(self, limit: int = 10) -> Dict:
        """List all databases"""
        return self.execute_tool("databases_list", {"limit": limit})

    def create_database(self, name: str, type: str, project: str = None) -> Dict:
        """Create a new database"""
        args = {"name": name, "type": type}
        if project:
            args["project"] = project
        return self.execute_tool("databases_create", args)

    def get_system_status(self) -> Dict:
        """Get system resource status"""
        return self.execute_tool("system_status")

    def cleanup_docker(self, cleanup_type: str = "all") -> Dict:
        """Clean up Docker resources"""
        if cleanup_type == "images":
            return self.execute_tool("docker_cleanup_images")
        elif cleanup_type == "containers":
            return self.execute_tool("docker_cleanup_containers")
        elif cleanup_type == "volumes":
            return self.execute_tool("docker_volumes_cleanup")
        else:
            return self.execute_tool("docker_system_prune")

    def get_client_info(self) -> Dict:
        """Get detected client information"""
        return self._make_request("/client", "GET")


# Example usage
def main():
    """Example usage of KiroEasyPanelClient"""
    client = KiroEasyPanelClient()

    # Check server health
    print("=== Health Check ===")
    health = client.health_check()
    print(json.dumps(health, indent=2))

    # List all projects
    print("\n=== Projects ===")
    projects = client.list_projects()
    print(json.dumps(projects, indent=2))

    # Get system status
    print("\n=== System Status ===")
    status = client.get_system_status()
    print(json.dumps(status, indent=2))

    # Batch operations example
    print("\n=== Batch Operations ===")
    batch_ops = [
        {"name": "projects_list", "args": {"limit": 5}},
        {"name": "databases_list", "args": {"limit": 5}},
        {"name": "system_status"}
    ]
    batch_result = client.batch_execute(batch_ops)
    print(json.dumps(batch_result, indent=2))


if __name__ == "__main__":
    main()