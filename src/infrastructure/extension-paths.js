/**
 * All extension pages must use built files under dist/.
 * Load the project root in chrome://extensions after `npm run build`.
 */
const BUILD_PREFIX = 'dist/';

/**
 * @param {string} path Path relative to dist/, e.g. src/presentation/popup/popup.html
 */
export function extUrl(path) {
  return chrome.runtime.getURL(`${BUILD_PREFIX}${path}`);
}

export const LOGIN_URL = extUrl('src/presentation/auth/login.html');
export const PRICING_URL = extUrl('src/presentation/pricing/pricing.html');
export const POPUP_URL = extUrl('src/presentation/popup/popup.html');
export const PREVIEW_URL = extUrl('src/presentation/preview/preview.html');
