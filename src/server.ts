import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getClient, translateAuthError } from "./client.js";
import { protectStdout } from "./logger.js";
import { buildToolRegistry } from "./tools/index.js";
import { VERSION } from "./version.js";

export interface ServeOptions {
  allowWrite: boolean;
}

function toolResult(data: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], isError };
}

export function createServer(opts: ServeOptions): Server {
  const registry = buildToolRegistry(opts);
  const server = new Server({ name: "telegram-mcp-connect", version: VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...registry.values()].map(({ name, description, inputSchema, annotations }) => ({
      name,
      description,
      inputSchema,
      annotations,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = registry.get(req.params.name);
    if (!tool) {
      return toolResult({ error: `Unknown tool ${req.params.name}` }, true);
    }

    try {
      const client = await getClient();
      const data = await tool.handler((req.params.arguments ?? {}) as Record<string, unknown>, { client });
      return toolResult(data);
    } catch (err) {
      const error = translateAuthError(err);
      return toolResult({ error: error.message }, true);
    }
  });

  return server;
}

export async function serve(opts: ServeOptions): Promise<void> {
  protectStdout();
  const server = createServer(opts);
  await server.connect(new StdioServerTransport());
}
