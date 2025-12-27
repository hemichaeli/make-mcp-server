# Make.com MCP Server - Setup Guide

## Quick Start

### 1. Get Make.com Credentials

**API Token:**
1. Make.com → Profile → API
2. Create new token with scopes:
   - `scenarios:read`
   - `scenarios:write`
   - `scenarios:run`
   - `connections:read`
   - `datastores:read`

**Team ID:**
- From URL: `https://eu1.make.com/XXXXX/scenarios` → XXXXX is Team ID

**Zone:**
- eu1.make.com / eu2.make.com / us1.make.com / us2.make.com

### 2. Deploy to Railway

1. Go to Railway.app
2. New Project → Deploy from GitHub
3. Select: hemichaeli/make-mcp-server
4. Add environment variables:
   - `MAKE_API_TOKEN` = your token
   - `MAKE_ZONE` = eu1.make.com
   - `MAKE_TEAM_ID` = your team id

### 3. Connect to Claude.ai

1. Copy Railway URL
2. Claude.ai → Settings → Connectors
3. Add Connector
4. URL: `https://your-railway-url/sse`

## Available Tools

| Tool | Description |
|------|-------------|
| `list_scenarios` | List all scenarios |
| `get_scenario` | Get scenario details |
| `get_scenario_blueprint` | Get workflow blueprint |
| `run_scenario` | Run scenario immediately |
| `start_scenario` | Activate (turn ON) |
| `stop_scenario` | Deactivate (turn OFF) |
| `get_scenario_logs` | View execution logs |
| `list_connections` | List API connections |
| `list_data_stores` | List data stores |
| `create_scenario` | Create new scenario |

## Usage Examples

After connecting, ask Claude:

- "Show me all my Make scenarios"
- "Run scenario 12345"
- "Turn off scenario 12345"
- "Show logs for scenario 12345"
- "Create a new scenario with this blueprint..."
