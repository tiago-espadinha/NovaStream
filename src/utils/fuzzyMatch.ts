/** Lowercase, strip accents and punctuation, and collapse whitespace: "Pokémon: Red!" → "pokemon red". */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Edit distance with adjacent transpositions, giving up once it exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }
      row.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = row;
  }
  return prev[b.length];
}

// Short words must match exactly (as a prefix); longer ones tolerate one or two typos.
function allowedTypos(word: string): number {
  if (word.length >= 8) return 2;
  if (word.length >= 4) return 1;
  return 0;
}

function wordMatches(queryWord: string, textWord: string): boolean {
  if (textWord.startsWith(queryWord)) return true;
  const typos = allowedTypos(queryWord);
  if (typos === 0) return false;
  // Compare against the whole word and against a same-length prefix, so "echos" finds
  // "echoes" and "kingdm" finds "kingdoms".
  return (
    editDistance(queryWord, textWord, typos) <= typos ||
    editDistance(queryWord, textWord.slice(0, queryWord.length), typos) <= typos
  );
}

/**
 * How closely `text` matches `query`: 0 contains it exactly, 1 every word starts a word in the
 * text (or spacing differs, e.g. "spiderman"), 2 every word is within a typo or two, null no match.
 * Matching ignores case, accents, and punctuation.
 */
export function matchScore(text: string, query: string): number | null {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;
  const normalizedText = normalizeText(text);
  if (normalizedText.includes(normalizedQuery)) return 0;
  if (normalizedText.replace(/ /g, '').includes(normalizedQuery.replace(/ /g, ''))) return 1;

  const textWords = normalizedText.split(' ');
  const queryWords = normalizedQuery.split(' ');
  if (queryWords.every((word) => textWords.some((textWord) => textWord.startsWith(word)))) return 1;
  if (queryWords.every((word) => textWords.some((textWord) => wordMatches(word, textWord)))) return 2;
  return null;
}
