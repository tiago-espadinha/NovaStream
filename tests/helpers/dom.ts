import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Imported by every test that renders into a document (those files start with
// `// @vitest-environment jsdom`). Static markup tests keep Node's faster environment.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  localStorage.clear();
  // jsdom has neither of these, and the shelves and notices need both.
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: false, media: query }),
  });
});

// Unmounting also matters for useDialog, whose stack of open panels lives at module level.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
