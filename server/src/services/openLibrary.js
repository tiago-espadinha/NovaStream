import { buildId, normalizeRatingOutOf10 } from './normalize.js';
import { ProviderError, upstreamFailure } from './providerError.js';

const BASE = 'https://openlibrary.org';
const SEARCH_FIELDS = 'key,title,author_name,first_publish_year,cover_i,subject,ratings_average,ratings_count';

function coverUrl(coverId, size = 'M') {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null;
}

function workIdFromKey(key) {
  return key.replace('/works/', ''); // "/works/OL45804W" -> "OL45804W"
}

function summarize(doc) {
  return {
    id: buildId('book', workIdFromKey(doc.key)),
    title: doc.title,
    type: 'book',
    rating: normalizeRatingOutOf10(doc.ratings_average, 5),
    genres: (doc.subject || []).slice(0, 3),
    releaseYear: doc.first_publish_year ?? null,
    posterUrl: coverUrl(doc.cover_i, 'M'),
  };
}

export async function searchBooks(query) {
  const url = new URL(`${BASE}/search.json`);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '20');
  url.searchParams.set('fields', SEARCH_FIELDS);
  const res = await fetch(url);
  if (!res.ok) throw upstreamFailure('Open Library', res);
  const data = await res.json();
  return (data.docs || [])
    .filter((d) => d.key && d.ratings_average != null && d.ratings_average !== 0)
    .map(summarize);
}

export async function searchBooksBySubject(subject) {
  const results = await searchBooks(`subject:${subject}`);
  const normalizedSubject = subject.toLowerCase();
  return results.filter((book) =>
    book.genres.some((genre) => genre.toLowerCase().includes(normalizedSubject)),
  );
}

// Not part of Open Library's documented API (it backs their site's Trending page), so its
// shape may change; a failure only removes books from the trending shelf.
export async function trendingBooks() {
  const url = new URL(`${BASE}/trending/weekly.json`);
  url.searchParams.set('limit', '20');
  // Without `fields` the trending works carry no ratings, only edition and cover data.
  url.searchParams.set('fields', SEARCH_FIELDS);
  const res = await fetch(url, {
    // Open Library asks clients to identify themselves.
    headers: { 'User-Agent': 'NovaStream/0.1.0 (https://github.com/tiago-espadinha/NovaStream)' },
  });
  if (!res.ok) throw upstreamFailure('Open Library', res);
  const data = await res.json();
  // Unrated works trend too; show "no rating" rather than 0, as search drops them.
  return (data.works || [])
    .filter((work) => work.key && work.title)
    .map(summarize)
    .map((book) => (book.rating === 0 ? { ...book, rating: null } : book));
}

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`);
  // Ratings/author lookups 404 fairly often on Open Library (e.g. unrated works) —
  // treat that as "no data" rather than failing the whole detail request.
  if (!res.ok) return null;
  return res.json();
}

export async function getBookDetail(workId) {
  const work = await fetchJson(`/works/${workId}.json`);
  if (!work) throw new ProviderError('not_found', 'Book not found on Open Library');

  const authorKeys = (work.authors || [])
    .map((a) => a.author?.key)
    .filter(Boolean)
    .slice(0, 3);

  const [ratings, ...authorDocs] = await Promise.all([
    fetchJson(`/works/${workId}/ratings.json`),
    ...authorKeys.map((k) => fetchJson(`${k}.json`)),
  ]);

  const description = typeof work.description === 'string' ? work.description : work.description?.value;
  const coverId = (work.covers || []).find((c) => c > 0);
  const yearMatch = work.first_publish_date?.match(/\d{4}/);

  return {
    id: buildId('book', workId),
    title: work.title,
    type: 'book',
    rating: normalizeRatingOutOf10(ratings?.summary?.average, 5),
    overview: description || 'No synopsis available.',
    genres: (work.subjects || []).slice(0, 5),
    releaseYear: yearMatch ? Number(yearMatch[0]) : null,
    runtime: null, // Open Library doesn't reliably expose page count at the work level
    creatorLabel: 'Author',
    creator: authorDocs.filter(Boolean).map((a) => a.name).join(', ') || 'Unknown',
    // No verified "buy/borrow" link data at this endpoint — honest generic pointer rather
    // than a fabricated storefront list.
    platforms: ['Read & borrow on Open Library'],
    posterUrl: coverUrl(coverId, 'L'),
  };
}