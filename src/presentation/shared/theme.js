/**
 * Follow OS light/dark preference automatically.
 */
export function resolveTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme() {
  const resolved = resolveTheme();
  document.documentElement.setAttribute('data-theme', resolved);
  return resolved;
}

/**
 * Initialize theme on page load and listen for system changes.
 */
export async function initTheme() {
  applyTheme();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyTheme();
  });
}
