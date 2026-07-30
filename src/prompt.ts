import { createInterface, type Interface } from "node:readline";

interface MutableInterface extends Interface {
  _writeToOutput?: (text: string) => void;
  output?: NodeJS.WriteStream;
}

const MASK_CHAR = "•";
const CLEAR_LINE = "\x1b[2K\x1b[G";

export function maskedLine(question: string, typedLength: number): string {
  return `${CLEAR_LINE}${question}${MASK_CHAR.repeat(Math.max(0, typedLength))}`;
}

let rl: MutableInterface | null = null;
let queued: string[] = [];
let waiting: ((line: string) => void) | null = null;
let closed = false;

function getInterface(): MutableInterface {
  if (rl) return rl;
  rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY === true,
  }) as MutableInterface;

  rl.on("line", (line: string) => {
    const resolve = waiting;
    waiting = null;
    if (resolve) resolve(line);
    else queued.push(line);
  });

  rl.on("close", () => {
    closed = true;
    const resolve = waiting;
    waiting = null;
    resolve?.("");
  });

  return rl;
}

function readLine(): Promise<string> {
  const next = queued.shift();
  if (next !== undefined) return Promise.resolve(next);
  if (closed) return Promise.resolve("");
  return new Promise<string>((resolve) => {
    waiting = resolve;
  });
}

export function closePrompts(): void {
  rl?.close();
  rl = null;
  queued = [];
  waiting = null;
  closed = false;
}

export async function ask(question: string, opts: { mask?: boolean; default?: string } = {}): Promise<string> {
  const iface = getInterface();

  const mask = opts.mask === true && process.stdin.isTTY === true;
  const original = iface._writeToOutput;

  if (mask) {
    iface._writeToOutput = (text: string) => {
      if (text.includes("\n")) {
        iface.output?.write("\n");
        return;
      }
      iface.output?.write(maskedLine(question, iface.line?.length ?? 0));
    };
  }

  process.stdout.write(question);
  try {
    const answer = (await readLine()).trim();
    return answer || opts.default || "";
  } finally {
    if (mask) iface._writeToOutput = original;
  }
}

export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await ask(`${question} ${hint} `)).toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

export const style = {
  bold: (s: string) => (color() ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (color() ? `\x1b[2m${s}\x1b[0m` : s),
  green: (s: string) => (color() ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (color() ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s: string) => (color() ? `\x1b[31m${s}\x1b[0m` : s),
  cyan: (s: string) => (color() ? `\x1b[36m${s}\x1b[0m` : s),
};

function color(): boolean {
  return process.stdout.isTTY === true && !process.env.NO_COLOR;
}
