import { spawn, spawnSync } from "node:child_process";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import {
  configExists,
  configHome,
  configPath,
  deleteConfig,
  isCompleteConfig,
  permissionsAreTight,
  readConfig,
  tightenPermissions,
  writeConfig,
  type TgConfig,
} from "../src/config.js";
import { existingAccountGuard } from "../src/auth.js";
import { buildClient, withTimeout } from "../src/client.js";
import { createStderrLogger } from "../src/logger.js";
import { ask, closePrompts, confirm, PromptAborted, style } from "../src/prompt.js";
import { senderName, type Sender } from "../src/format.js";
import { serve } from "../src/server.js";
import { VERSION } from "../src/version.js";

const PKG = "telegram-mcp-connect";
const ADD_MCP_VERSION = "2.0.0";
const APPS_URL = "https://my.telegram.org/apps";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "serve";
  const flags = new Set(argv.filter((a) => a.startsWith("-")));

  if (flags.has("--version") || flags.has("-V")) return void console.log(VERSION);
  if (flags.has("--help") || flags.has("-h") || command === "help") return printHelp();

  switch (command) {
    case "setup":
      return cmdSetup();
    case "doctor":
      return cmdDoctor();
    case "logout":
      return cmdLogout();
    case "install":
      return void runAddMcp(argv.slice(1));
    case "serve":
      return cmdServe(flags.has("--allow-write"));
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(`
${style.bold("telegram-mcp-connect")} ${style.dim(`v${VERSION}`)} — read your Telegram from Claude Code, Codex, Cursor and friends.

${style.bold("Commands")}
  setup            Connect your Telegram account and register with your AI tools
  doctor           Check the setup and show what is wrong
  install          Register with AI tools only (no login) — passes through to add-mcp
  logout           Revoke the session on Telegram and delete it locally
  serve            Run the MCP server on stdio (what your AI tool invokes)

${style.bold("Flags")}
  --allow-write    Expose tg_send_message / tg_mark_read (serve only)
  --version        Print version
  --help           This text

${style.bold("Where things live")}
  ${configPath()} ${style.dim("(mode 0600)")}

${style.dim("Start with: npx telegram-mcp-connect setup")}
`);
}

async function cmdServe(allowWriteFlag: boolean): Promise<void> {
  const config = readConfig();
  await serve({ allowWrite: allowWriteFlag || Boolean(config.allowWrite) });
}

async function cmdSetup(): Promise<void> {
  console.log(`\n${style.bold("telegram-mcp-connect")} ${style.dim(VERSION)}\n`);

  const config = readConfig();
  const creds = await collectCredentials(config);
  const session = await runPhoneLogin(creds, config);
  if (!session) return;

  const allowWrite = await confirm("Allow sending messages?", false);

  writeConfig({ ...creds, session: session.session, allowWrite });

  console.log(`\n${style.green("✓")} ${session.name}`);
  console.log(`${style.green("✓")} ${configPath()}\n`);

  await registerWithAgents(allowWrite);
}

async function collectCredentials(config: Partial<TgConfig>): Promise<{ apiId: number; apiHash: string }> {
  if (config.apiId && config.apiHash) {
    if (!(await confirm(`Use saved app ${config.apiId}?`, true))) {
      return promptCredentials();
    }
    return { apiId: config.apiId, apiHash: config.apiHash };
  }
  return promptCredentials();
}

async function promptCredentials(): Promise<{ apiId: number; apiHash: string }> {
  console.log(`Create an app at ${style.cyan(APPS_URL)}\n`);
  openBrowser(APPS_URL);

  let apiId = 0;
  while (!apiId) {
    const raw = Number(await ask("  api_id:   ", { mask: true }));
    if (Number.isInteger(raw) && raw > 0) apiId = raw;
  }

  let apiHash = "";
  while (!apiHash) {
    const raw = (await ask("  api_hash: ", { mask: true })).trim();
    if (/^[a-f0-9]{32}$/i.test(raw)) apiHash = raw;
  }

  return { apiId, apiHash };
}

async function runPhoneLogin(
  creds: { apiId: number; apiHash: string },
  existing: Partial<TgConfig>,
): Promise<{ session: string; name: string } | null> {
  if (existing.session) {
    const who = await describeExistingSession({ ...creds, session: existing.session, allowWrite: false });
    if (who && !(await confirm(`Stay signed in as ${who}?`, true))) {
      // fall through to a fresh login
    } else if (who) {
      return { session: existing.session, name: who };
    }
  }

  console.log("");

  const client = new TelegramClient(new StringSession(""), creds.apiId, creds.apiHash, {
    connectionRetries: 3,
    baseLogger: createStderrLogger("none"),
  });

  const accountGuard = existingAccountGuard((err) => {
    console.error(style.red(`  ${err.message}`));
  });
  try {
    await client.start({
      phoneNumber: async () => ask("  phone:    "),
      phoneCode: async () => ask("  code:     "),
      password: async () => ask("  password: ", { mask: true }),
      firstAndLastNames: accountGuard.firstAndLastNames,
      onError: accountGuard.onError,
    });
  } catch (err) {
    const message = accountGuard.signUpWasRequired()
      ? "That phone number does not belong to an existing Telegram account. No account was created."
      : err instanceof Error
        ? err.message
        : String(err);
    console.error(`\n${style.red("Login failed:")} ${message}`);
    console.error("Nothing was saved. Run `npx telegram-mcp-connect setup` to try again.");
    await client.disconnect().catch(() => undefined);
    return null;
  }

  const session = String(client.session.save());
  const me = (await client.getMe()) as unknown as Sender;
  await client.disconnect().catch(() => undefined);

  if (!session) {
    console.error(style.red("\nLogin did not complete. Nothing was saved."));
    return null;
  }
  return { session, name: senderName(me) };
}

async function describeExistingSession(config: TgConfig): Promise<string | null> {
  const client = buildClient(config);
  try {
    await withTimeout(client.connect(), 15_000, "timeout");
    const me = (await client.getMe()) as unknown as Sender;
    return senderName(me);
  } catch {
    return null;
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

async function registerWithAgents(allowWrite: boolean): Promise<void> {
  if (!(await confirm("Add to your AI tools?", true))) {
    printManualInstructions(allowWrite);
    return;
  }

  const args = [`${PKG}@${VERSION}`, "--global", ...(allowWrite ? ["--args", "--allow-write"] : [])];
  if (!runAddMcp(args)) printManualInstructions(allowWrite);
}

function runAddMcp(args: string[]): boolean {
  const result = spawnSync("npx", ["-y", `add-mcp@${ADD_MCP_VERSION}`, ...args], { stdio: "inherit" });
  return result.status === 0;
}

function printManualInstructions(allowWrite: boolean): void {
  const suffix = allowWrite ? " --allow-write" : "";
  console.log(`
  Claude Code:  claude mcp add -s user telegram -- npx -y ${PKG}@${VERSION}${suffix}
  Codex:        codex mcp add telegram -- npx -y ${PKG}@${VERSION}${suffix}
  Other:        npx -y ${PKG}@${VERSION}${suffix}
`);
}

async function cmdDoctor(): Promise<void> {
  console.log(`${style.bold("telegram-mcp-connect doctor")} ${style.dim(`v${VERSION}`)}\n`);
  let problems = 0;

  const config = readConfig();
  line("Config directory", configHome());
  line("Config file", configPath());

  if (!config.apiId || !config.apiHash) {
    problems += fail("API credentials", "missing — run `npx telegram-mcp-connect setup`");
  } else {
    pass("API credentials", `app id ${config.apiId}, hash ${mask(config.apiHash)}`);
  }

  if (!config.session) {
    problems += fail("Telegram session", "not signed in — run `npx telegram-mcp-connect setup`");
  } else {
    pass("Telegram session", `${config.session.length} chars, ${mask(config.session)}`);
  }

  if (!configExists()) {
    line("File permissions", "n/a — no config file yet");
  } else if (!permissionsAreTight()) {
    problems += fail("File permissions", "config is readable by other users — tightening to 0600");
    tightenPermissions();
  } else {
    pass("File permissions", "0600");
  }

  pass("Tool mode", config.allowWrite ? "read + send (--allow-write)" : "read-only");

  if (isCompleteConfig(config)) {
    process.stdout.write("  Connecting to Telegram… ");
    const client = buildClient(config);
    try {
      await withTimeout(client.connect(), 20_000, "timed out after 20s");
      const me = (await client.getMe()) as unknown as Sender;
      console.log(`${style.green("ok")} — signed in as ${style.bold(senderName(me))}`);
    } catch (err) {
      console.log(style.red("failed"));
      problems += fail("Connection", err instanceof Error ? err.message : String(err));
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  console.log("\n  Registered with:");
  spawnSync("npx", ["-y", `add-mcp@${ADD_MCP_VERSION}`, "list", "--global"], { stdio: "inherit" });

  console.log(
    problems === 0
      ? `\n${style.green("All good.")} If a tool still cannot see the server, restart it.`
      : `\n${style.red(`${problems} problem(s) found.`)} Run ${style.cyan("npx telegram-mcp-connect setup")}.`,
  );
  if (problems > 0) process.exitCode = 1;
}

const line = (label: string, value: string) => console.log(`  ${label.padEnd(18)} ${style.dim(value)}`);
const pass = (label: string, value: string) => console.log(`  ${style.green("✓")} ${label.padEnd(16)} ${style.dim(value)}`);
function fail(label: string, value: string): number {
  console.log(`  ${style.red("✗")} ${label.padEnd(16)} ${value}`);
  return 1;
}
const mask = (s: string) => (s.length <= 8 ? "…" : `${s.slice(0, 4)}…${s.slice(-4)}`);

async function cmdLogout(): Promise<void> {
  const config = readConfig();
  if (!isCompleteConfig(config)) {
    console.log("Not signed in.");
    deleteConfig();
    return;
  }

  if (!(await confirm("\nLog out and revoke this session?", false))) return;

  const client = buildClient(config);
  let revoked = false;
  try {
    await withTimeout(client.connect(), 20_000, "timed out");
    await client.invoke(new (await import("teleproto")).Api.auth.LogOut());
    revoked = true;
    console.log(`${style.green("✓")} Session revoked on Telegram.`);
  } catch (err) {
    console.log(
      style.yellow(`! Could not revoke remotely (${err instanceof Error ? err.message : String(err)}).`),
    );
    console.log(style.yellow("  Remove it manually in Telegram → Settings → Devices."));
  } finally {
    await client.disconnect().catch(() => undefined);
  }

  if (!revoked) {
    console.log(style.yellow(`  Kept ${configPath()} so you can retry logout.`));
    process.exitCode = 1;
    return;
  }

  deleteConfig();
  console.log(`${style.green("✓")} Deleted ${configPath()}`);
  console.log(
    style.dim(`  To unregister from your AI tools: npx add-mcp@${ADD_MCP_VERSION} remove --global ${PKG}`),
  );
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
  } catch {}
}

main()
  .then(closePrompts)
  .catch((err) => {
    closePrompts();
    if (err instanceof PromptAborted) process.exit(130);
    console.error(style.red(`\n${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  });
