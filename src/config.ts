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

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = (m[2] ?? "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
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

export function findLegacyEnv(dirs: string[]): { path: string; values: Record<string, string> } | null {
  for (const dir of dirs) {
    const path = join(dir, ".env");
    if (!existsSync(path)) continue;
    try {
      const values = parseEnvFile(readFileSync(path, "utf8"));
      if (values.TG_SESSION) return { path, values };
    } catch {}
  }
  return null;
}

export function isCompleteConfig(c: Partial<TgConfig>): c is TgConfig {
  return Boolean(c.apiId && c.apiHash && c.session);
}
