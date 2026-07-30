import { readTools } from "./read.js";
import { writeTools } from "./write.js";
import type { ToolDefinition } from "./types.js";

export type { ToolDefinition, ToolContext } from "./types.js";

export function buildToolRegistry(opts: { allowWrite: boolean }): Map<string, ToolDefinition> {
  const tools = [...readTools, ...(opts.allowWrite ? writeTools : [])];
  return new Map(tools.map((t) => [t.name, t]));
}
