# telegram-mcp-connect

Connect Telegram to Claude Code, Codex, Cursor and any other MCP client. It runs as a Telegram MCP server on your own machine and gives your assistant read access to your Telegram account, so you can ask about your chats in plain language.

```
"summarise the last few messages in Acme"
"what did I miss in my unread chats today?"
"search my telegram for that link someone sent about that restaurant"
```

Your Telegram session is stored in one file on your laptop. Nothing is uploaded and there is no server in the middle.

## Install

You need [Node.js](https://nodejs.org) 18 or newer. If you have `npm`, you already have it.

```bash
npx telegram-mcp-connect setup
```

The setup wizard walks through three things:

1. **Creating a Telegram app.** It opens [my.telegram.org/apps](https://my.telegram.org/apps) for you and tells you which two values to copy back.
2. **Signing in.** Phone number, then a login code. The code arrives inside the Telegram app, not by SMS.
3. **Connecting your editors.** It detects Claude Code, Codex, Cursor, VS Code, Zed, Windsurf, Gemini CLI and others, then writes the config for whichever ones you pick.

Restart your editor and ask it something about your Telegram.

## Tools

| Tool | What it does |
| --- | --- |
| `tg_get_me` | Shows which account is connected |
| `tg_list_chats` | Lists your chats newest first, with unread counts |
| `tg_read_chat` | Reads recent messages from one chat |
| `tg_search` | Searches your messages globally or inside one chat |

### Naming a chat

You can refer to a chat the way you would say it out loud. All of these work:

```
"Acme <> Contoso"    exact title
"acme contoso"       punctuation and case are ignored
@some_channel        username
-1001234567890       numeric id from tg_list_chats
```

If a name matches more than one chat, the server says which ones so you can pick.

### Reading further back

`tg_read_chat` returns 30 messages by default and 100 at most. To page backwards, pass `beforeId` set to the lowest message id you have already seen.

## Sending messages

Off by default. The setup wizard asks whether you want it, and you can also turn it on for one editor at a time:

```bash
# Claude Code can send, Cursor stays read only
npx add-mcp telegram-mcp-connect@latest -g -a claude-code --args --allow-write
npx add-mcp telegram-mcp-connect@latest -g -a cursor
```

That adds `tg_send_message` and `tg_mark_read`.

## Where your credentials live

Everything sits in `~/.telegram-mcp-connect/config.json` with `0600` permissions, in a `0700` directory. That file is the only copy. It is deliberately kept out of your editors' config files, which are plain text and often end up inside a git repo.

Two things worth knowing before you run this:

**Telegram has no read only credential.** The session that reads your chats can also send messages and delete the account. This server only exposes read tools by default, but the session it holds is not itself restricted. Run it on a computer you control.

**Messages from group chats are untrusted text.** If your assistant reads a message that says "ignore your previous instructions", that is a prompt injection attempt. Keeping sending disabled limits what such a message can do.

To revoke access, either run the command below or open Telegram and go to Settings > Devices.

```bash
npx telegram-mcp-connect logout
```

This revokes the session on Telegram's side and deletes the local file.

## Troubleshooting

```bash
npx telegram-mcp-connect doctor
```

It checks your credentials, file permissions and connection, prints the account you are signed in as, and lists which editors have the server registered.

**The editor cannot see the server.** Restart it. Most MCP clients only read their config at startup.

**"Not signed in to Telegram".** Your session was revoked, usually from Settings > Devices. Run `setup` again.

**Login code never arrives.** Check the Telegram app itself rather than your SMS inbox. Telegram sends it as a message from the account named "Telegram".

## Configuration

You do not normally need these. `setup` writes the config file for you. They exist for containers and CI, and they override the config file when set.

| Variable | Purpose |
| --- | --- |
| `TG_API_ID`, `TG_API_HASH` | Telegram app credentials |
| `TG_SESSION` | Session string |
| `TG_ALLOW_WRITE` | Set to `1` to enable the send tools |
| `TG_MCP_HOME` | Config directory, defaults to `~/.telegram-mcp-connect` |
| `TG_MCP_LOG_LEVEL` | `error`, `warn`, `info` or `debug`, written to stderr |
| `TG_MCP_CONNECT_TIMEOUT_MS` | How long to wait for Telegram before giving up, defaults to 20000 |

`NO_COLOR` is respected for all CLI output.

## Development

Built with [Bun](https://bun.com) and shipped as plain Node.

```bash
bun install
bun test
bun run dev setup     # run the CLI from source
bun run build         # produce dist/cli.js
```

Anything under `src/` and `bin/` has to run on Node 18, since users install through `npx`. Bun only APIs like `Bun.file` and `import.meta.dir` will build fine and then crash for everyone.
