import { describe, expect, it } from 'vitest';

// The rule, instead of deciding case by case:
// - every file in src/hooks has tests/hooks/<name>.test.tsx;
// - every component and screen, and App, has tests/components/<name>.test.tsx;
// - each test imports the file it is named after, as a value rather than only its types;
// - a hook, or a component with a handler or a hook of its own beyond translation, is rendered
//   with Testing Library; only a component with neither may settle for static markup.

const hooks = import.meta.glob<string>(['../../src/hooks/**/*.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const components = import.meta.glob<string>(
  ['../../src/components/**/*.tsx', '../../src/screens/**/*.tsx', '../../src/App.tsx'],
  { query: '?raw', import: 'default', eager: true },
);
const tests = import.meta.glob<string>(['../hooks/*.test.{ts,tsx}', '../components/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const INTERACTIVE = /\bon[A-Z]\w*=|\buse(?!Translation\b)[A-Z]\w*[(<]/;
const RENDERS = /\brender(?:Hook)?\(/;

const baseName = (path: string) => path.split('/').pop()!.replace(/\..*$/, '');

/** What is wrong with the tests for these sources; empty when the rule holds. */
function coverageProblems(
  sources: { hooks: Record<string, string>; components: Record<string, string> },
  testFiles: Record<string, string>,
): string[] {
  const problems: string[] = [];
  const check = (path: string, folder: 'hooks' | 'components', behaviour: boolean) => {
    const name = baseName(path);
    const test = Object.entries(testFiles).find(
      ([testPath]) => testPath.includes(`/${folder}/`) && baseName(testPath) === name,
    )?.[1];
    if (test === undefined) {
      problems.push(`${path} has no test: add tests/${folder}/${name}.test.tsx`);
      return;
    }
    if (!new RegExp(`^import (?!type\\b)[^;]*from '[^']*/${name}'`, 'm').test(test)) {
      problems.push(`tests/${folder}/${name}.test.tsx does not import ${name}`);
    }
    if (behaviour && !(test.includes('@testing-library/react') && RENDERS.test(test))) {
      problems.push(`tests/${folder}/${name}.test.tsx needs a behaviour test: ${name} responds to the user`);
    }
  };
  for (const path of Object.keys(sources.hooks)) check(path, 'hooks', true);
  for (const [path, source] of Object.entries(sources.components)) {
    check(path, 'components', INTERACTIVE.test(source));
  }
  return problems;
}

describe('test coverage', () => {
  it('finds what it is meant to check', () => {
    expect(Object.keys(hooks).map(baseName)).toContain('useDialog');
    const names = Object.keys(components).map(baseName);
    for (const name of ['App', 'Header', 'SavedPage', 'MediaDetail', 'StarIcon']) expect(names).toContain(name);
  });

  it('every hook, component and screen has the test the rule asks for', () => {
    expect(coverageProblems({ hooks, components }, tests)).toEqual([]);
  });
});

describe('the coverage rule', () => {
  const button = 'export const X = () => <button onClick={go} />;';
  const icon = 'export const X = () => <svg />;';

  it('fails for a new hook or component with no test', () => {
    expect(
      coverageProblems(
        {
          hooks: { '../../src/hooks/useNew.ts': 'export {}' },
          components: { '../../src/components/New/New.tsx': icon },
        },
        {},
      ),
    ).toEqual([
      '../../src/hooks/useNew.ts has no test: add tests/hooks/useNew.test.tsx',
      '../../src/components/New/New.tsx has no test: add tests/components/New.test.tsx',
    ]);
  });

  it('does not accept a test of the same name in the other folder', () => {
    const problems = coverageProblems(
      { hooks: { '../../src/hooks/useNew.ts': '' }, components: {} },
      { '../components/useNew.test.tsx': "import '@testing-library/react'; import x from '../src/useNew'" },
    );
    expect(problems).toHaveLength(1);
  });

  it('fails for a test that never imports what it is named after', () => {
    expect(
      coverageProblems(
        { hooks: {}, components: { '../../src/components/New/New.tsx': icon } },
        { '../components/New.test.tsx': "import { Other } from '../../src/components/Other/Other';" },
      ),
    ).toEqual(['tests/components/New.test.tsx does not import New']);
  });

  it('asks for behaviour from anything interactive, and markup is enough otherwise', () => {
    const markup = "import { New } from '../../src/components/New/New';";
    const behaviour = `${markup} import { render } from '@testing-library/react'; render(<New />);`;
    const sources = (source: string) => ({ hooks: {}, components: { '../../src/components/New/New.tsx': source } });

    expect(coverageProblems(sources(button), { '../components/New.test.tsx': markup })).toEqual([
      'tests/components/New.test.tsx needs a behaviour test: New responds to the user',
    ]);
    expect(coverageProblems(sources(button), { '../components/New.test.tsx': behaviour })).toEqual([]);
    expect(coverageProblems(sources(icon), { '../components/New.test.tsx': markup })).toEqual([]);
  });

  it('looks in nested folders, and at hooks written in .tsx', () => {
    expect(Object.keys(components).map(baseName)).toContain('MediaDetail');
    expect(
      coverageProblems(
        { hooks: { '../../src/hooks/nested/useNew.tsx': '' }, components: { '../../src/screens/a/b/Deep.tsx': icon } },
        {},
      ),
    ).toHaveLength(2);
  });

  it('does not count a type-only import as testing the file', () => {
    expect(
      coverageProblems(
        { hooks: {}, components: { '../../src/components/New/New.tsx': icon } },
        { '../components/New.test.tsx': "import type { New } from '../../src/components/New/New';" },
      ),
    ).toEqual(['tests/components/New.test.tsx does not import New']);
  });

  it('does not count importing Testing Library without rendering', () => {
    const test = "import { New } from '../../src/components/New/New'; import { screen } from '@testing-library/react';";
    expect(
      coverageProblems(
        { hooks: {}, components: { '../../src/components/New/New.tsx': button } },
        { '../components/New.test.tsx': test },
      ),
    ).toEqual(['tests/components/New.test.tsx needs a behaviour test: New responds to the user']);
  });

  it('treats a component using any hook but translation as interactive', () => {
    const test = "import { New } from '../../src/components/New/New';";
    const check = (source: string) =>
      coverageProblems(
        { hooks: {}, components: { '../../src/components/New/New.tsx': source } },
        { '../components/New.test.tsx': test },
      );
    expect(check('const panel = useDialog<HTMLDivElement>(close);')).toHaveLength(1);
    expect(check('const [state, send] = useReducer(reduce, 0);')).toHaveLength(1);
    expect(check('const { t } = useTranslation();')).toEqual([]);
  });

  it('always asks for behaviour from a hook', () => {
    expect(
      coverageProblems(
        { hooks: { '../../src/hooks/useNew.ts': 'export {}' }, components: {} },
        { '../hooks/useNew.test.ts': "import { useNew } from '../../src/hooks/useNew';" },
      ),
    ).toEqual(['tests/hooks/useNew.test.tsx needs a behaviour test: useNew responds to the user']);
  });
});
