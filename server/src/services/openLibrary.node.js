import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { searchBooks, trendingBooks } from './openLibrary.js';

let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockOpenLibrary(responses) {
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    calls.push(url);
    return { ok: true, json: async () => responses[url.pathname] ?? {} };
  };
  return calls;
}

const atomicHabits = {
  key: '/works/OL17930368W',
  title: 'Atomic Habits',
  ratings_average: 3.971233,
  ratings_count: 1460,
  subject: ['Habits'],
  first_publish_year: 2016,
  cover_i: 12539702,
};

test('trending books ask for ratings and match the rating search shows', async () => {
  const calls = mockOpenLibrary({
    '/trending/weekly.json': { works: [atomicHabits] },
    '/search.json': { docs: [atomicHabits] },
  });
  const [trending] = await trendingBooks();
  const [searched] = await searchBooks('atomic habits');

  const fields = calls[0].searchParams.get('fields').split(',');
  assert.ok(fields.includes('ratings_average'), 'trending must request ratings');
  assert.equal(trending.rating, 7.9);
  assert.deepEqual(trending, searched);
});

test('trending books with no rating keep the "no rating" fallback', async () => {
  mockOpenLibrary({
    '/trending/weekly.json': {
      works: [
        { key: '/works/OL1W', title: 'Never Rated' },
        { key: '/works/OL2W', title: 'Rated Zero', ratings_average: 0, ratings_count: 0 },
      ],
    },
  });
  const books = await trendingBooks();
  assert.deepEqual(books.map((book) => book.rating), [null, null]);
});
