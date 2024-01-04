import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Attributes a reader or assistive technology sees.
const TEXT_ATTRIBUTES = new Set(['aria-label', 'aria-description', 'aria-valuetext', 'title', 'placeholder', 'alt', 'label']);
// Text that is the same in every language.
const ALLOWED = new Set(['Nova Stream', 'TMDB', 'RAWG', 'Last.fm', 'Deezer', 'Open Library']);

const hasWords = (text: string) => /\p{L}/u.test(text) && !ALLOWED.has(text.trim());

function stringValue(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' ');
  if (ts.isConditionalExpression(node)) return [stringValue(node.whenTrue), stringValue(node.whenFalse)].filter(Boolean).join(' ') || null;
  if (ts.isBinaryExpression(node)) {
    // `a === 'tv' && <b/>` shows only the right side; a comparison's strings are never rendered.
    const kind = node.operatorToken.kind;
    if (kind === ts.SyntaxKind.AmpersandAmpersandToken) return stringValue(node.right);
    if (
      kind === ts.SyntaxKind.EqualsEqualsToken ||
      kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      kind === ts.SyntaxKind.ExclamationEqualsToken ||
      kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
    ) {
      return null;
    }
    return [stringValue(node.left), stringValue(node.right)].filter(Boolean).join(' ') || null;
  }
  if (ts.isParenthesizedExpression(node)) return stringValue(node.expression);
  return null;
}

/** Copy written straight into JSX: text children, string children, and text attributes. */
export function findUntranslated(source: string, fileName = 'file.tsx'): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const report = (node: ts.Node, text: string) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart());
    found.push(`${fileName}:${line + 1} ${JSON.stringify(text.trim())}`);
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasWords(node.text)) report(node, node.text);
    if (ts.isJsxExpression(node) && node.expression && ts.isJsxElement(node.parent)) {
      const text = stringValue(node.expression);
      if (text && hasWords(text)) report(node, text);
    }
    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText()) && node.initializer) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      const text = value && stringValue(value);
      if (text && hasWords(text)) report(node, text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

// src/config.ts types import.meta itself, so only the glob Vite rewrites at build time is declared here.
declare global {
  interface ImportMeta {
    glob<T>(patterns: string[], options: { query: string; import: string; eager: true }): Record<string, T>;
  }
}

// Every component's source, read through Vite so the test needs no Node file APIs.
const components = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('findUntranslated', () => {
  it('catches text children, string children and text attributes, and skips keys and punctuation', () => {
    const found = findUntranslated(
      `const a = <p title="Close dialog">Hello <b>{'world'}</b> {t('x')} · {count}</p>;
       const b = <img alt={done ? 'Done' : 'Waiting'} />;
       const c = <span aria-label={\`\${name} profile\`}>Nova Stream</span>;
       const d = <p>{kind !== 'text' && (kind === 'tv' || ok) && <b>{kind}</b>}{ok && 'Shown'}</p>;`,
    );
    expect(found).toEqual([
      'file.tsx:1 "Close dialog"',
      'file.tsx:1 "Hello"',
      'file.tsx:1 "world"',
      'file.tsx:2 "Done Waiting"',
      'file.tsx:3 "profile"',
      'file.tsx:4 "Shown"',
    ]);
  });
});

describe('UI copy', () => {
  it('comes from the message catalogs', () => {
    const found = Object.entries(components).flatMap(([path, source]) =>
      findUntranslated(source, path.replace(/^\.\.\//, '')),
    );
    expect(found).toEqual([]);
  });
});
