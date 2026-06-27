export const API_BASE = import.meta.env.VITE_API_BASE ?? ''

/**
 * Wrapper autour de fetch qui dispatch 'auth:unauthorized' sur window
 * si le serveur répond 401, ce qui déclenche le logout dans AuthContext.
 */
export async function apiFetch(url, options = {}) {
  const res = await fetch(url, options)
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'))
  }
  return res
}
