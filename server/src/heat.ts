export function calcExternalHeat(input: { ratingCount?: unknown; popularity?: unknown }) {
  const ratingCount = Math.max(0, Math.round(Number(input?.ratingCount) || 0));
  const popularity = Math.max(0, Number(input?.popularity) || 0);
  const popularityScore = popularity > 0 ? Math.round(popularity * 1000) : 0;
  const heatScore = Math.max(ratingCount, popularityScore);
  const heatSource = heatScore <= 0
    ? ""
    : popularityScore > ratingCount
      ? "tmdb_popularity"
      : "rating_count";
  return { heatScore, heatSource };
}

export function formatHeatValue(score: unknown) {
  const n = Math.max(0, Math.round(Number(score) || 0));
  if (!n) return "";
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`;
  return String(n);
}

export function withHeatFields<T extends Record<string, any>>(row: T) {
  const computed = calcExternalHeat(row);
  const heatScore = Math.max(0, Math.round(Number(row?.heatScore) || computed.heatScore));
  const heatSource = String(row?.heatSource || computed.heatSource || "");
  return { ...row, heatScore, heatSource, heatValue: formatHeatValue(heatScore) };
}
