const WELCOMED_KEY = 'growing-reader:welcomed';

/** Whether this browser has already passed the one-time front door. */
export function hasBeenWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markWelcomed(): void {
  try {
    localStorage.setItem(WELCOMED_KEY, 'true');
  } catch {
    // If storage is unavailable, showing the introduction again is harmless.
  }
}

export function resetWelcomeForTest(): void {
  try {
    localStorage.removeItem(WELCOMED_KEY);
  } catch {
    // Tests can still render the app when storage is unavailable.
  }
}
