import { describe, expect, it } from 'vitest';
import {
  cssFiles,
  INDEX,
  LAYER_ORDER,
  layerBlocks,
  layerStatements,
  moduleFiles,
  readSource,
  resolveFrom,
  stripComments,
} from '../helpers/css';

const layered = cssFiles.filter((file) => file !== INDEX);

const imports = () => {
  const found: string[] = [];
  for (const m of readSource(INDEX).matchAll(/@import '([^']+)';/g)) found.push(resolveFrom(INDEX, m[1]));
  for (const file of moduleFiles) {
    for (const m of readSource(file).matchAll(/^import '(\.[^']+\.css)';$/gm)) found.push(resolveFrom(file, m[1]));
  }
  return found.filter((file) => file !== INDEX);
};

describe('stylesheet structure', () => {
  it('declares the layer order once, before the imports', () => {
    expect(LAYER_ORDER).toEqual(['tokens', 'base', 'primitives', 'components', 'screens']);
    expect(layerStatements(readSource(INDEX))).toHaveLength(1);
    expect(stripComments(readSource(INDEX))).toMatch(/^\s*@layer [^;]+;\s*@import/);
    for (const file of layered) expect(layerStatements(readSource(file)), file).toEqual([]);
  });

  it('keeps nothing in the index but the order and imports', () => {
    const rest = stripComments(readSource(INDEX))
      .replace(/@layer[^;]+;/, '')
      .replace(/@import '[^']+';/g, '');
    expect(rest.trim()).toBe('');
  });

  it('loads the index before any other import, so the first CSS the browser sees sets the order', () => {
    const firstImport = /^import .*$/m.exec(readSource('main.tsx'))?.[0];
    expect(firstImport).toBe("import './styles/index.css';");
  });

  it('puts every rule in a declared layer', () => {
    for (const file of layered) {
      const { blocks, outside } = layerBlocks(readSource(file));
      expect(outside, `${file} has rules outside a layer`).toBe('');
      expect(blocks.length, `${file} is empty`).toBeGreaterThan(0);
      for (const { name } of blocks) expect(LAYER_ORDER, `${file} uses ${name}`).toContain(name);
    }
  });

  it('notices an unlayered rule, wherever it sits in the file', () => {
    expect(layerBlocks('.a { color: red; }\n@layer base { .b { top: 0; } }').outside).toBe('.a { color: red; }');
    expect(layerBlocks('@layer base { @media print { .b { top: 0; } } }\n.a { top: 0; }').outside).toBe(
      '.a { top: 0; }',
    );
    expect(layerBlocks('/* note */\n@layer base { /* } */ .b { top: 0; } }').outside).toBe('');
    expect(() => layerBlocks('@layer base { /* never closed')).toThrow(/unterminated/);
  });

  it('uses the tokens layer only in the tokens file', () => {
    for (const file of layered) {
      const names = layerBlocks(readSource(file)).blocks.map((block) => block.name);
      expect(names.includes('tokens'), file).toBe(file === 'styles/tokens.css');
    }
  });

  it('imports every stylesheet exactly once', () => {
    expect(imports().sort()).toEqual(layered);
  });
});
