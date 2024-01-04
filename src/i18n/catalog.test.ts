import { describe, expect, it } from 'vitest';
import { catalogs } from '.';
import { en } from './locales/en';

type Tree = { [key: string]: string | Tree };

/** Every leaf as `path → text`, e.g. `footer.newTab → (opens in a new tab)`. */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const leaves = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') leaves.set(path, value);
    else for (const [leaf, text] of flatten(value, path)) leaves.set(leaf, text);
  }
  return leaves;
}

const PLURAL = /_(zero|one|two|few|many|other)$/;
// `{{name}}` interpolations and `<strong>` / `<chip/>` Trans tags, whichever way a tag is written.
const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*(\w+)\s*}}|<(\w+)\s*\/?>/g)].map((m) => (m[1] ? `{{${m[1]}}}` : `<${m[2]}>`)).sort();

const source = flatten(en);
const pluralBases = new Set([...source.keys()].filter((key) => PLURAL.test(key)).map((key) => key.replace(PLURAL, '')));

describe.each(Object.entries(catalogs))('%s catalog', (locale, messages) => {
  const leaves = flatten(messages as Tree);

  it('has every English key, and no others', () => {
    const singular = (keys: Iterable<string>) => [...keys].filter((key) => !PLURAL.test(key)).sort();
    expect(singular(leaves.keys())).toEqual(singular(source.keys()));
  });

  it('has no empty strings', () => {
    const empty = [...leaves].filter(([, text]) => !text.trim()).map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('keeps every placeholder and tag of the English text', () => {
    for (const [key, text] of source) {
      const translated = leaves.get(key);
      if (translated !== undefined) expect(placeholders(translated), key).toEqual(placeholders(text));
    }
  });

  it('has exactly the plural forms its language uses', () => {
    const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
    for (const base of pluralBases) {
      const forms = [...leaves.keys()].filter((key) => key.replace(PLURAL, '') === base && PLURAL.test(key));
      expect(forms.map((key) => key.match(PLURAL)![1]).sort(), base).toEqual([...categories].sort());
    }
  });
});
