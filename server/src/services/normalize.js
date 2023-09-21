// Every provider service maps its raw response into this shape so the frontend
// doesn't need to know which API a piece of media came from. Ratings are normalized
// to a 0–10 scale to match TMDb (the largest source), since RAWG and Open Library
// both report out of 5.
export function normalizeRatingOutOf10(value, sourceMax) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round((value * (10 / sourceMax)) * 10) / 10;
}

export function buildId(type, externalId) {
  return `${type}-${externalId}`;
}
