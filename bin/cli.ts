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
import { ask, closePrompts, confirm, style } from "../src/prompt.js";
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
  console.log(`
${style.bold("Connect Telegram to your AI tools")}

This runs entirely on your machine. Your Telegram session is saved to
${style.cyan(configPath())} and is never uploaded anywhere.

${style.yellow("Be aware:")} a Telegram session grants full access to your account, not
read-only access. Only do this on a computer you control.
`);

  if (!(await confirm("Continue?", true))) return;

  const config = readConfig();
  const creds = await collectCredentials(config);
  const session = await runPhoneLogin(creds, config);
  if (!session) return;

  const allowWrite = await confirm(
    `\nAllow ${style.bold("sending")} messages too? Read-only is the safe default`,
    false,
  );

  const finalConfig: TgConfig = { ...creds, session: session.session, allowWrite };
  writeConfig(finalConfig);

  console.log(`\n${style.green("✓")} Signed in as ${style.bold(session.name)}`);
  console.log(`${style.green("✓")} Saved to ${configPath()} ${style.dim("(mode 0600)")}`);
  console.log(`${style.green("✓")} Mode: ${allowWrite ? "read + send" : "read-only"}`);

  await registerWithAgents(allowWrite);

  console.log(`
${style.bold("Done.")} Restart your AI tool, then try:

  ${style.cyan('"list my telegram chats"')}
  ${style.cyan('"summarise the last 20 messages in <chat name>"')}

If a tool cannot see it, run ${style.cyan("npx telegram-mcp-connect doctor")}.
`);
}

async function collectCredentials(config: Partial<TgConfig>): Promise<{ apiId: number; apiHash: string }> {
  if (config.apiId && config.apiHash) {
    console.log(`\n${style.green("✓")} Using saved API credentials (app id ${config.apiId}).`);
    if (!(await confirm("Replace them?", false))) {
      return { apiId: config.apiId, apiHash: config.apiHash };
    }
  }

  console.log(`
${style.bold("Step 1 of 2 — create a Telegram app")}

Telegram needs every program that talks to it to have an app id. This identifies
${style.bold("the app")}, not you, and takes a minute:

  1. Opening ${style.cyan(APPS_URL)}
  2. Log in with your phone number ${style.dim("(the code arrives in your Telegram app)")}
  3. Fill the form — any title works, e.g. "my mcp"
  4. Copy ${style.bold("App api_id")} and ${style.bold("App api_hash")} back here
`);

  openBrowser(APPS_URL);

  let apiId = 0;
  while (!apiId) {
    const raw = await ask("App api_id (numbers only): ");
    apiId = Number(raw);
    if (!Number.isInteger(apiId) || apiId <= 0) {
      apiId = 0;
      console.log(style.red("  That does not look like an api_id. It is a number, around 7 or 8 digits long."));
    }
  }

  let apiHash = "";
  while (!apiHash) {
    const raw = (await ask("App api_hash (32 characters): ")).trim();
    if (/^[a-f0-9]{32}$/i.test(raw)) apiHash = raw;
    else console.log(style.red("  That should be 32 characters, letters a to f and digits only."));
  }

  return { apiId, apiHash };
}

async function runPhoneLogin(
  creds: { apiId: number; apiHash: string },
  existing: Partial<TgConfig>,
): Promise<{ session: string; name: string } | null> {
  if (existing.session) {
    const who = await describeExistingSession({ ...creds, session: existing.session, allowWrite: false });
    if (who) {
      console.log(`\n${style.green("✓")} Already signed in as ${style.bold(who)}.`);
      if (!(await confirm("Sign in again as a different account?", false))) {
        return { session: existing.session, name: who };
      }
    }
  }

  console.log(`
${style.bold("Step 2 of 2 — sign in")}

${style.yellow("Note:")} the login code is sent ${style.bold("inside the Telegram app")}, not by SMS.
Look for a message from "Telegram" on your phone or desktop app.
`);

  const client = new TelegramClient(new StringSession(""), creds.apiId, creds.apiHash, {
    connectionRetries: 3,
    baseLogger: createStderrLogger("none"),
  });

  const accountGuard = existingAccountGuard((err) => {
    console.error(style.red(`  ${err.message}`));
  });
  try {
    await client.start({
      phoneNumber: async () => ask("Phone number with country code (e.g. +91…): "),
      phoneCode: async () => ask("Login code from your Telegram app: "),
      password: async () => ask("Two-step verification password: ", { mask: true }),
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
  console.log(`
${style.bold("Register with your AI tools")}

add-mcp writes the right config for Claude Code, Codex, Cursor, VS Code, Zed and
more. Your credentials are ${style.bold("not")} passed to it — they stay in the file above.
`);

  if (!(await confirm("Run it now?", true))) {
    printManualInstructions(allowWrite);
    return;
  }

  const args = [`${PKG}@${VERSION}`, "--global", ...(allowWrite ? ["--args", "--allow-write"] : [])];
  const ok = runAddMcp(args);
  if (!ok) {
    console.log(style.yellow("\nCould not run add-mcp. Register manually:"));
    printManualInstructions(allowWrite);
  }
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
  Anything else: run  npx -y ${PKG}@${VERSION}${suffix}  as a stdio MCP server.
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
    console.log("Not signed in — nothing to do.");
    deleteConfig();
    return;
  }

  console.log(`
This revokes the session on Telegram's side and deletes it locally.
Your AI tools will lose Telegram access until you run setup again.
`);
  if (!(await confirm("Log out?", false))) return;

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
    console.error(style.red(`\n${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  });
