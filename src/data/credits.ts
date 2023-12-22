export type DeveloperLinkKind = 'github' | 'linkedin' | 'portfolio';

export interface DeveloperLink {
  kind: DeveloperLinkKind;
  label: string;
  href: string;
}

export interface DataSource {
  name: string;
  covers: string;
  href: string;
  // Extra wording a provider's terms ask for beside its name.
  credit?: string;
}

export const DEVELOPER_NAME = 'Tiago Espadinha';

export const DEVELOPER_LINKS: DeveloperLink[] = [
  { kind: 'github', label: 'GitHub', href: 'https://github.com/tiago-espadinha' },
  { kind: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/tiago-espadinha-sim%C3%B5es' },
  { kind: 'portfolio', label: 'Portfolio', href: 'https://personal-portfolio-three-hazel-61.vercel.app/' },
];

export const DATA_SOURCES: DataSource[] = [
  { name: 'TMDB', covers: 'films and series', href: 'https://www.themoviedb.org/' },
  { name: 'RAWG', covers: 'games', href: 'https://rawg.io/' },
  { name: 'Last.fm', covers: 'music', href: 'https://www.last.fm/', credit: 'powered by AudioScrobbler' },
  { name: 'Deezer', covers: 'music photos and release years', href: 'https://www.deezer.com/' },
  { name: 'Open Library', covers: 'books', href: 'https://openlibrary.org/' },
];

// Wording required by TMDB's API terms.
export const TMDB_NOTICE = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';
