import { Router } from 'express';
import {
  searchMovies,
  searchMoviesByGenre,
  searchMoviesByTag,
  searchTv,
  searchTvByGenre,
  searchTvByTag,
} from '../services/tmdb.js';
import { searchBooks, searchBooksBySubject } from '../services/openLibrary.js';
import { searchGames, searchGamesByGenre, searchGamesByTag } from '../services/rawg.js';
import { searchMusic, searchMusicByTag } from '../services/lastfm.js';
import { searchAcross } from '../services/searchAcross.js';

export const searchRouter = Router();

const MAX_QUERY_LENGTH = 200;

const SEARCHERS = {
  movie: searchMovies,
  tv: searchTv,
  book: searchBooks,
  game: searchGames,
  music: searchMusic,
};

const METADATA_SEARCHERS = {
  genre: {
    movie: searchMoviesByGenre,
    tv: searchTvByGenre,
    book: searchBooksBySubject,
    game: searchGamesByGenre,
    music: searchMusicByTag,
  },
  tag: {
    movie: searchMoviesByTag,
    tv: searchTvByTag,
    book: searchBooksBySubject,
    game: searchGamesByTag,
    music: searchMusicByTag,
  },
};

// GET /api/search?q=dune&type=all|movie|tv|book|game
searchRouter.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || 'all');
  const musicKind = String(req.query.musicKind || 'all');
  if (!q) return res.status(400).json({ error: 'Query param "q" is required' });
  if (q.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({ error: `Query must be ${MAX_QUERY_LENGTH} characters or fewer` });
  }
  if (!['all', 'artist', 'album', 'song'].includes(musicKind)) {
    return res.status(400).json({ error: `Unknown music kind "${musicKind}"` });
  }

  const selector = q.match(/^(genre|tag):\s*(.+)$/i);
  const searchTerm = selector ? selector[2].trim() : q;
  const searchers = selector
    ? METADATA_SEARCHERS[selector[1].toLowerCase()]
    : SEARCHERS;

  const typesToSearch = type === 'all' ? Object.keys(SEARCHERS) : [type];
  if (!typesToSearch.every((t) => Object.hasOwn(SEARCHERS, t))) {
    return res.status(400).json({ error: `Unknown type "${type}"` });
  }

  const { results, errors } = await searchAcross(typesToSearch, (t) =>
    searchers[t](searchTerm, t === 'music' ? musicKind : undefined),
  );

  res.json({ results, errors });
});
