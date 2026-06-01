import chalk from 'chalk';
import boxen from 'boxen';

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

const AGENT_COLORS: Record<string, (s: string) => string> = {
  coordinator: chalk.cyan.bold,
  researcherAgent: chalk.blue.bold,
  writerAgent: chalk.green.bold,
  editorAgent: chalk.magenta.bold,
  backendAgent: chalk.yellow.bold,
  frontendAgent: chalk.cyan.bold,
  designAgent: chalk.magenta.bold,
  user: chalk.white.bold,
  orchestrator: chalk.gray.bold,
  system: chalk.gray,
};

const TYPE_COLORS = {
  user: chalk.white,
  agent: chalk.green,
  system: chalk.gray,
};

export function agent(name: string): string {
  const fn = AGENT_COLORS[name] ?? chalk.white.bold;
  return fn(name);
}

export function box(title: string, color: 'cyan' | 'green' | 'yellow' | 'red' | 'magenta' = 'cyan') {
  console.log(
    boxen(chalk.bold(title), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: color,
    })
  );
}

export function rule(label?: string) {
  const width = 70;
  if (!label) {
    console.log(chalk.gray('─'.repeat(width)));
    return;
  }
  const pad = Math.max(0, width - label.length - 2);
  console.log(chalk.gray('─') + ' ' + chalk.bold(label) + ' ' + chalk.gray('─'.repeat(pad)));
}

export function iteration(n: number, agentName: string) {
  console.log();
  console.log(
    chalk.gray('▸') +
      ' ' +
      chalk.bold(`Iteration ${n}`) +
      chalk.gray(' │ ') +
      agent(agentName)
  );
  console.log(chalk.gray('─'.repeat(70)));
}

export function info(msg: string) {
  console.log(chalk.blue('ℹ') + ' ' + msg);
}

export function success(msg: string) {
  console.log(chalk.green('✓') + ' ' + msg);
}

export function warn(msg: string) {
  console.log(chalk.yellow('⚠') + ' ' + msg);
}

export function error(msg: string) {
  console.log(chalk.red('✗') + ' ' + msg);
}

export function step(msg: string) {
  console.log(chalk.gray('  ·') + ' ' + chalk.dim(msg));
}

export function message(from: string, to: string, type: 'user' | 'agent' | 'system', content: string) {
  const arrow = chalk.gray('→');
  const typeTag = TYPE_COLORS[type](`[${type}]`);
  const preview = content.replace(/\s+/g, ' ').slice(0, 60);
  const truncated = content.length > 60 ? chalk.gray('…') : '';
  console.log(
    chalk.gray('  📬 ') + agent(from) + ' ' + arrow + ' ' + agent(to) + ' ' + typeTag + ' ' + chalk.dim(`"${preview}${truncated}"`)
  );
}

export function tool(toolName: string, summary?: string) {
  const main = chalk.gray('  🔧 ') + chalk.bold(toolName);
  console.log(summary ? main + chalk.gray(' — ') + chalk.dim(summary) : main);
}

export function handoff(from: string, to: string) {
  console.log(chalk.yellow('  ↪ handoff: ') + agent(from) + chalk.gray(' → ') + agent(to));
}

export function complete(label: string, detail?: string) {
  console.log(chalk.green('  ✅ ') + chalk.bold(label) + (detail ? chalk.gray(' — ') + detail : ''));
}

export function debug(label: string, payload?: unknown) {
  if (!DEBUG) return;
  console.log(chalk.magenta('  🐛 ') + chalk.dim(label));
  if (payload !== undefined) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    console.log(chalk.gray(text.split('\n').map(l => '     ' + l).join('\n')));
  }
}

export function kv(pairs: Record<string, string | number>) {
  const keyWidth = Math.max(...Object.keys(pairs).map(k => k.length));
  for (const [k, v] of Object.entries(pairs)) {
    console.log('  ' + chalk.gray(k.padEnd(keyWidth)) + '  ' + chalk.bold(String(v)));
  }
}

/** A search/tool sub-step line, with an emphasized label and dim value. */
export function detail(label: string, value: string) {
  console.log(chalk.gray('     ') + chalk.cyan(label) + chalk.gray(': ') + chalk.dim(value));
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * A lightweight terminal spinner for long-running steps (e.g. web search,
 * model calls). No external dependency. Renders in place on a TTY; on a
 * non-TTY (CI, piped logs) it degrades to a single start line + final line so
 * output stays clean. Always call .succeed()/.fail()/.stop() to finish.
 */
export function spinner(text: string) {
  const isTTY = Boolean(process.stdout.isTTY);
  let frame = 0;
  let current = text;
  let timer: ReturnType<typeof setInterval> | null = null;

  const render = () => {
    if (!isTTY) return;
    const f = chalk.cyan(SPINNER_FRAMES[frame = (frame + 1) % SPINNER_FRAMES.length]);
    process.stdout.write(`\r  ${f} ${chalk.dim(current)}\x1b[K`);
  };

  const clearLine = () => {
    if (isTTY) process.stdout.write('\r\x1b[K');
  };

  const finish = (symbol: string, msg: string) => {
    if (timer) clearInterval(timer);
    timer = null;
    clearLine();
    console.log(`  ${symbol} ${msg}`);
  };

  if (isTTY) {
    render();
    timer = setInterval(render, 80);
  } else {
    console.log(chalk.gray('  ⋯ ') + chalk.dim(text));
  }

  return {
    update(next: string) {
      current = next;
      if (!isTTY) console.log(chalk.gray('  ⋯ ') + chalk.dim(next));
    },
    succeed(msg: string = current) {
      finish(chalk.green('✓'), msg);
    },
    fail(msg: string = current) {
      finish(chalk.red('✗'), chalk.red(msg));
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      clearLine();
    },
  };
}

export type Spinner = ReturnType<typeof spinner>;

export function isDebug(): boolean {
  return DEBUG;
}