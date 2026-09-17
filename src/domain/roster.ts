export interface ParsedName {
  firstName: string;
  lastName: string;
}

/** One student per line; first and last name split on the first space. */
export function parseRoster(pasted: string): ParsedName[] {
  return pasted
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseName);
}

export function parseName(line: string): ParsedName {
  const trimmed = line.trim();
  const space = trimmed.indexOf(' ');
  if (space === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1).trim() };
}

export function displayName(name: ParsedName): string {
  return name.lastName ? `${name.firstName} ${name.lastName}` : name.firstName;
}

/** Up to two letters for the roster avatar: "AL" for Ada Lovelace, "C" for Cher. */
export function initials(name: ParsedName): string {
  return ((name.firstName[0] ?? '') + (name.lastName[0] ?? '')).toUpperCase();
}
