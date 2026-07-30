import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface TgConfig {
  apiId: number;
  apiHash: string;
  session: string;

  allowWrite: boolean;
}

export function configHome(): string {
  return process.env.TG_MCP_HOME || join(homedir(), ".telegram-mcp-connect");
}

export function configPath(): string {
  return join(configHome(), "config.json");
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readConfig(): Partial<TgConfig> {
  const file = readJson(configPath()) ?? {};
  const env = process.env;
  const apiId = env.TG_API_ID ? Number(env.TG_API_ID) : Number(file.apiId);
  const apiHash = env.TG_API_HASH || (file.apiHash as string | undefined);
  const session = env.TG_SESSION || (file.session as string | undefined);
  const allowWrite = env.TG_ALLOW_WRITE
    ? env.TG_ALLOW_WRITE === "1" || env.TG_ALLOW_WRITE === "true"
    : Boolean(file.allowWrite);

  return {
    ...(Number.isFinite(apiId) && apiId > 0 ? { apiId } : {}),
    ...(apiHash ? { apiHash } : {}),
    ...(session ? { session } : {}),
    allowWrite,
  };
}

export function writeConfig(config: TgConfig): void {
  const dir = configHome();
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  try {
    chmodSync(dir, 0o700);
  } catch {}
  const target = configPath();
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, target);
  chmodSync(target, 0o600);
}

export function deleteConfig(): void {
  rmSync(configPath(), { force: true });
}

export function configExists(): boolean {
  return existsSync(configPath());
}

export function permissionsAreTight(): boolean {
  try {
    return (statSync(configPath()).mode & 0o077) === 0;
  } catch {
    return true;
  }
}

export function tightenPermissions(): void {
  try {
    chmodSync(configPath(), 0o600);
  } catch {}
}

export function isCompleteConfig(c: Partial<TgConfig>): c is TgConfig {
  return Boolean(c.apiId && c.apiHash && c.session);
}
