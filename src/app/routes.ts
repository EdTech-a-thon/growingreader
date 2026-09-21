import type { Screen } from './store.svelte';

/**
 * The teacher's screens have addresses; the student-facing three (start, recording, done)
 * deliberately do not (ADR-0006). While a student holds the device the URL stays on the
 * student's page, so a refresh mid-reading lands somewhere real and the address bar is
 * never a way back into the teacher's app.
 */
export function pathForScreen(screen: Screen): string | undefined {
  switch (screen.name) {
    case 'roster':
      return '/';
    case 'student':
      return `/students/${screen.studentId}`;
    case 'review':
      return `/readings/${screen.readingId}`;
    case 'passages':
      return '/passages';
    case 'settings':
      return '/settings';
    default:
      return undefined;
  }
}

/** The screen a URL asks for, or undefined when the path is not one of ours. */
export function screenForPath(path: string): Screen | undefined {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/') return { name: 'roster' };
  if (clean === '/passages') return { name: 'passages' };
  if (clean === '/settings') return { name: 'settings' };
  const student = clean.match(/^\/students\/([^/]+)$/);
  if (student) return { name: 'student', studentId: decodeURIComponent(student[1]) };
  const reading = clean.match(/^\/readings\/([^/]+)$/);
  if (reading) return { name: 'review', readingId: decodeURIComponent(reading[1]) };
  return undefined;
}

/** Pages rendered instead of the app shell; they are not screens and keep their own URLs. */
export function isStaticPage(path: string): boolean {
  return path === '/about' || path === '/privacy';
}
