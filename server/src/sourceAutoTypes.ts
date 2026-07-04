export function parseAutoTypeIds(value: unknown) {
  if (Array.isArray(value)) {
    return uniqueTypeIds(value);
  }
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? uniqueTypeIds(parsed) : [];
    } catch {
      return [];
    }
  }
  return uniqueTypeIds([raw]);
}

export function serializeAutoTypeIds(value: unknown) {
  const ids = parseAutoTypeIds(value);
  return ids.length ? JSON.stringify(ids) : "";
}

function uniqueTypeIds(values: unknown[]) {
  return [...new Set(values
    .map((value) => String(value || "").trim())
    .filter(Boolean))]
    .slice(0, 100);
}
