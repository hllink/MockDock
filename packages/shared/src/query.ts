import type { NormalizedQuery, QueryValue } from "./contracts.js";

export function normalizeQuery(
  input: Record<string, unknown> | Record<string, QueryValue>
): NormalizedQuery {
  const normalizedEntries = Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, value.map(String)] as const;
      }

      return [key, String(value)] as const;
    });

  return Object.fromEntries(normalizedEntries);
}

export function stringifyNormalizedQuery(query: NormalizedQuery | null): string | null {
  if (!query) {
    return null;
  }

  return JSON.stringify(normalizeQuery(query));
}

export function formatNormalizedQuery(query: NormalizedQuery | null): string {
  if (!query || Object.keys(query).length === 0) {
    return "Default response";
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(normalizeQuery(query))) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      continue;
    }

    params.append(key, value);
  }

  return `?${params.toString()}`;
}
