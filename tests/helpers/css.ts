declare global {
  interface ImportMeta {
    glob<T>(patterns: string[], options: { query: string; import: string; eager: true }): Record<string, T>;
  }
}

const fromSrc = (sources: Record<string, string>) =>
  Object.fromEntries(Object.entries(sources).map(([path, text]) => [path.replace('../../src/', ''), text]));

const stylesheets = fromSrc(
  import.meta.glob<string>(['../../src/**/*.css'], { query: '?raw', import: 'default', eager: true }),
);
const modules = fromSrc(
  import.meta.glob<string>(['../../src/**/*.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }),
);

export const INDEX = 'styles/index.css';

/** Every stylesheet under `src/`, as paths from there. */
export const cssFiles = Object.keys(stylesheets).sort();

export const readSource = (file: string) => {
  const text = stylesheets[file] ?? modules[file];
  if (text === undefined) throw new Error(`no such source: ${file}`);
  return text;
};

/** Every TypeScript module under `src/`, as paths from there. */
export const moduleFiles = Object.keys(modules).sort();

/** `relative`, written in the file at `from`, as a path from `src/`. */
export const resolveFrom = (from: string, relative: string) =>
  new URL(relative, `file:///${from}`).pathname.replace(/^\//, '');

export const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');

/** The layer names of each `@layer a, b;` statement in a stylesheet, comments ignored. */
export const layerStatements = (text: string) =>
  [...stripComments(text).matchAll(/@layer\s+([^{};]+);/g)].map((m) => m[1].split(',').map((name) => name.trim()));

function commentEnd(text: string, start: number) {
  const end = text.indexOf('*/', start);
  if (end < 0) throw new Error('unterminated comment');
  return end + 2;
}

/**
 * Splits a stylesheet into its top-level `@layer name { ... }` blocks and whatever else sits outside them,
 * comments aside: nothing, in a layered file.
 */
export function layerBlocks(text: string) {
  const blocks: { name: string; body: string }[] = [];
  let outside = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('/*', i)) {
      i = commentEnd(text, i);
      continue;
    }
    const head = /^@layer\s+([\w-]+)\s*\{/.exec(text.slice(i));
    if (!head) {
      outside += text[i++];
      continue;
    }
    const start = i + head[0].length;
    let depth = 1;
    let end = start;
    while (depth > 0 && end < text.length) {
      if (text.startsWith('/*', end)) {
        end = commentEnd(text, end);
        continue;
      }
      if (text[end] === '{') depth++;
      if (text[end] === '}') depth--;
      end++;
    }
    blocks.push({ name: head[1], body: text.slice(start, end - 1) });
    i = end;
  }
  return { blocks, outside: outside.trim() };
}

/** The layers in cascade order, as `src/styles/index.css` declares them. */
export const LAYER_ORDER = layerStatements(readSource(INDEX))[0];
