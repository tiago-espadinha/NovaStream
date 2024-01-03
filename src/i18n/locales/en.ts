// The source catalog: every other locale must have each of these keys (src/i18n/catalog.test.ts).
export const en = {
  errors: {
    offline: 'Couldn’t reach the server. Check your connection and try again.',
    notConfigured: 'Accounts aren’t set up on the server yet.',
    wrongPassword: 'That password isn’t right.',
    rateLimited_one: 'Too many password attempts. Try again in {{count}} minute.',
    rateLimited_other: 'Too many password attempts. Try again in {{count}} minutes.',
  },
  footer: {
    builtBy: 'Nova Stream was developed by <strong>{{name}}</strong>',
    portfolio: '{{name}}’s portfolio',
    profiles: '{{name}}’s profiles',
    newTab: '(opens in a new tab)',
    dataFrom: 'Data from',
    listComma: ', ',
    listAnd: ' and ',
  },
  header: {
    language: 'Language',
  },
  detail: {
    creatorRole: {
      director: 'Director',
      creator: 'Creator',
      studio: 'Studio',
      author: 'Author',
      artist: 'Artist',
    },
    unknownCreator: 'Unknown',
    length: {
      hoursMinutes: '{{hours}}h {{minutes}}m',
      minutes: '{{minutes}} min',
      seasons_one: '{{count}} season',
      seasons_other: '{{count}} seasons',
      episodes_one: '{{count}} episode',
      episodes_other: '{{count}} episodes',
      // Used when TMDb doesn't report the count, so there is no number to pluralize on.
      seasonsUnknown: '? seasons',
      episodesUnknown: '? episodes',
      joiner: ' · ',
      playtime_one: '~{{count}} hr',
      playtime_other: '~{{count}} hrs',
      tracks_one: '{{count}} track',
      tracks_other: '{{count}} tracks',
      pages_one: '{{count}} page',
      pages_other: '{{count}} pages',
    },
    season: {
      specials: 'Specials',
      numbered: 'Season {{number}}',
    },
    episode: {
      numbered: 'Episode {{number}}',
    },
  },
};
