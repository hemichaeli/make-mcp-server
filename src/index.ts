import express from "express";

const app = express();
app.use(express.json());

// Configuration from environment
const MAKE_API_TOKEN = process.env.MAKE_API_TOKEN || "";
const MAKE_ZONE = process.env.MAKE_ZONE || "eu1.make.com";
const MAKE_TEAM_ID = process.env.MAKE_TEAM_ID || "";
const PORT = process.env.PORT || 3000;

const BASE_URL = `https://${MAKE_ZONE}/api/v2`;

// Helper function for API requests
async function makeRequest(
  endpoint: string,
  method: string = "GET",
  body?: any
): Promise<any> {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    "Authorization": `Token ${MAKE_API_TOKEN}`,
    "Content-Type": "application/json",
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Make API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Tool definitions
const tools = [
  {
    name: "list_scenarios",
    description: "List all scenarios in the Make.com team. Returns scenario IDs, names, and status.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of scenarios to return (default: 50)" },
        isActive: { type: "boolean", description: "Filter by active/inactive status" },
      },
    },
  },
  {
    name: "get_scenario",
    description: "Get details of a specific scenario by ID",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: { type: "number", description: "The scenario ID" },
      },
      required: ["scenarioId"],
    },
  },
  {
    name: "get_scenario_blueprint",
    description: "Get the blueprint (workflow definition) of a scenario",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: { type: "number", description: "The scenario ID" },
      },
      required: ["scenarioId"],
    },
  },
  {
    name: "run_scenario",
    description: "Trigger/run a scenario immediately",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: { type: "number", description: "The scenario ID to run" },
        data: { type: "object", description: "Optional input data to pass to the scenario" },
      },
      required: ["scenarioId"],
    },
  },
  {
    name: "start_scenario",
    description: "Activate a scenario (turn it ON)",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: { type: "number", description: "The scenario ID to activate" },
      },
      required: ["scenarioId"],
    },
  },
  {
    name: "stop_scenario",
    description: "Deactivate a scenario (turn it OFF)",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: { type: "number", description: "The scenario ID to deactivate" },
      },
      required: ["scenarioId"],
    },
  },
  {
    name: "get_scenario_logs",
    description: "Get execution logs for a scenario",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: { type: "number", description: "The scenario ID" },
        limit: { type: "number", description: "Maximum number of logs to return (default: 20)" },
      },
      required: ["scenarioId"],
    },
  },
  {
    name: "list_connections",
    description: "List all connections (API credentials) in the team",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_data_stores",
    description: "List all data stores in the team",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_scenario",
    description: "Create a new scenario from a blueprint JSON",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name for the new scenario" },
        blueprint: { type: "string", description: "The scenario blueprint as JSON string" },
      },
      required: ["name", "blueprint"],
    },
  },
];

// Tool execution
async function executeTool(name: string, args: any): Promise<any> {
  switch (name) {
    case "list_scenarios": {
      const limit = args.limit || 50;
      let endpoint = `/scenarios?teamId=${MAKE_TEAM_ID}&pg[limit]=${limit}`;
      if (args.isActive !== undefined) endpoint += `&isActive=${args.isActive}`;
      const result = await makeRequest(endpoint);
      return result.scenarios;
    }
    case "get_scenario": {
      const result = await makeRequest(`/scenarios/${args.scenarioId}`);
      return result.scenario;
    }
    case "get_scenario_blueprint": {
      const result = await makeRequest(`/scenarios/${args.scenarioId}/blueprint`);
      return result.response?.blueprint || result.blueprint;
    }
    case "run_scenario": {
      const body = args.data ? { data: args.data } : {};
      return await makeRequest(`/scenarios/${args.scenarioId}/run`, "POST", body);
    }
    case "start_scenario": {
      return await makeRequest(`/scenarios/${args.scenarioId}/start`, "POST");
    }
    case "stop_scenario": {
      return await makeRequest(`/scenarios/${args.scenarioId}/stop`, "POST");
    }
    case "get_scenario_logs": {
      const limit = args.limit || 20;
      const result = await makeRequest(`/scenarios/${args.scenarioId}/logs?pg[limit]=${limit}`);
      return result.scenarioLogs;
    }
    case "list_connections": {
      const result = await makeRequest(`/connections?teamId=${MAKE_TEAM_ID}&pg[limit]=100`);
      return result.connections;
    }
    case "list_data_stores": {
      const result = await makeRequest(`/data-stores?teamId=${MAKE_TEAM_ID}`);
      return result.dataStores;
    }
    case "create_scenario": {
      const body = { teamId: parseInt(MAKE_TEAM_ID), name: args.name, blueprint: args.blueprint };
      const result = await makeRequest("/scenarios", "POST", body);
      return result.scenario;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// SSE endpoint for MCP
app.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  const initEvent = {
    jsonrpc: "2.0",
    method: "initialized",
    params: {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "make-mcp-server", version: "1.0.0" },
      capabilities: { tools: {} },
    },
  };
  
  res.write(`data: ${JSON.stringify(initEvent)}\n\n`);
  
  const keepAlive = setInterval(() => res.write(": keepalive\n\n"), 30000);
  req.on("close", () => clearInterval(keepAlive));
});

// MCP message endpoint
app.post("/mcp", async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;
  
  try {
    let result;
    
    switch (method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "make-mcp-server", version: "1.0.0" },
          capabilities: { tools: {} },
        };
        break;
      case "tools/list":
        result = { tools };
        break;
      case "tools/call":
        const toolResult = await executeTool(params.name, params.arguments || {});
        result = { content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }] };
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    
    res.json({ jsonrpc: "2.0", id, result });
  } catch (error) {
    res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
    });
  }
});

// Health check
app.get("/health", (req, res) => res.json({ status: "ok", service: "make-mcp-server" }));

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "Make.com MCP Server",
    version: "1.0.0",
    endpoints: { sse: "/sse", mcp: "/mcp", health: "/health" },
    tools: tools.map(t => t.name),
  });
});

app.listen(PORT, () => {
  console.log(`Make.com MCP Server running on port ${PORT}`);
});
