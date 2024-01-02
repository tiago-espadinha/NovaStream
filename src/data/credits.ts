export type DeveloperLinkKind = 'github' | 'linkedin';

export interface DeveloperLink {
  kind: DeveloperLinkKind;
  label: string;
  href: string;
}

export interface DataSource {
  name: string;
  href: string;
}

export const DEVELOPER_NAME = 'Tiago Espadinha';

// The developer's name in the footer links here; the profiles below are icon links.
export const DEVELOPER_PORTFOLIO = 'https://personal-portfolio-three-hazel-61.vercel.app/';

export const DEVELOPER_LINKS: DeveloperLink[] = [
  { kind: 'github', label: 'GitHub', href: 'https://github.com/tiago-espadinha' },
  { kind: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/tiago-espadinha-sim%C3%B5es' },
];

export const DATA_SOURCES: DataSource[] = [
  { name: 'TMDB', href: 'https://www.themoviedb.org/' },
  { name: 'RAWG', href: 'https://rawg.io/' },
  { name: 'Last.fm', href: 'https://www.last.fm/' },
  { name: 'Deezer', href: 'https://www.deezer.com/' },
  { name: 'Open Library', href: 'https://openlibrary.org/' },
];
