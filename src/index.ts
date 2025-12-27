import express, { Request, Response } from "express";
import { randomUUID } from "crypto";

const app = express();

// Configuration from environment
const MAKE_API_TOKEN = process.env.MAKE_API_TOKEN || "";
const MAKE_ZONE = process.env.MAKE_ZONE || "eu1.make.com";
const MAKE_TEAM_ID = process.env.MAKE_TEAM_ID || "";
const PORT = process.env.PORT || 3000;

const BASE_URL = `https://${MAKE_ZONE}/api/v2`;

// Session management for SSE
const sessions = new Map<string, Response>();

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

// Handle MCP JSON-RPC request
async function handleMcpRequest(request: any): Promise<any> {
  const { jsonrpc, id, method, params } = request;
  
  try {
    let result;
    
    switch (method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "make-mcp-server", version: "1.0.1" },
          capabilities: { tools: {} },
        };
        break;
      case "notifications/initialized":
        // Client acknowledgment - no response needed
        return null;
      case "tools/list":
        result = { tools };
        break;
      case "tools/call":
        const toolResult = await executeTool(params.name, params.arguments || {});
        result = { content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }] };
        break;
      case "ping":
        result = {};
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    
    if (id !== undefined) {
      return { jsonrpc: "2.0", id, result };
    }
    return null;
  } catch (error) {
    if (id !== undefined) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
      };
    }
    return null;
  }
}

// SSE endpoint - establishes connection and returns session ID
app.get("/sse", (req: Request, res: Response) => {
  const sessionId = randomUUID();
  
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  // Store session
  sessions.set(sessionId, res);
  
  // Send endpoint event with session ID
  res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);
  
  // Keepalive
  const keepAlive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 30000);
  
  req.on("close", () => {
    clearInterval(keepAlive);
    sessions.delete(sessionId);
  });
});

// Messages endpoint - receives MCP requests and sends responses via SSE
app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing sessionId" });
    return;
  }
  
  const sseResponse = sessions.get(sessionId)!;
  
  // Read raw body
  let body = "";
  req.setEncoding("utf8");
  
  for await (const chunk of req) {
    body += chunk;
  }
  
  try {
    const request = JSON.parse(body);
    const response = await handleMcpRequest(request);
    
    if (response) {
      sseResponse.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    }
    
    res.status(202).json({ status: "accepted" });
  } catch (error) {
    console.error("Error handling message:", error);
    res.status(400).json({ error: "Invalid request" });
  }
});

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", sessions: sessions.size, version: "1.0.1" });
});

// Root endpoint
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "Make.com MCP Server",
    version: "1.0.1",
    endpoints: { sse: "/sse", messages: "/messages", health: "/health" },
    tools: tools.map(t => t.name),
  });
});

app.listen(PORT, () => {
  console.log(`Make.com MCP Server v1.0.1 running on port ${PORT}`);
});
