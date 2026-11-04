const GUEST_MODE_KEY = 'easyfitness:guest-mode:v1'

// Remember this tab's choice across reloads; records still use the local repository.
export function readGuestMode(): boolean {
  try {
    return sessionStorage.getItem(GUEST_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveGuestMode(enabled: boolean): void {
  try {
    if (enabled) sessionStorage.setItem(GUEST_MODE_KEY, 'true')
    else sessionStorage.removeItem(GUEST_MODE_KEY)
  } catch {
    // In-memory navigation still works when browser storage is unavailable.
  }
}
