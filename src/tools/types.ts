import type { TelegramClient } from "teleproto";

export interface ToolContext {
  client: TelegramClient;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

export function readOnlyAnnotations(title: string): ToolDefinition["annotations"] {
  return {
    title,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
}

export function writeAnnotations(
  title: string,
  opts: { destructive: boolean; idempotent: boolean },
): ToolDefinition["annotations"] {
  return {
    title,
    readOnlyHint: false,
    destructiveHint: opts.destructive,
    idempotentHint: opts.idempotent,
    openWorldHint: true,
  };
}
