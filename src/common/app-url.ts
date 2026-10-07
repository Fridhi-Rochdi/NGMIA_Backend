/**
 * The public base URL of the frontend.
 *
 * FRONTEND_URL is a comma-separated CORS allowlist (the app plus the admin
 * console), so it must never be concatenated as-is into a link — that produced
 * URLs like "http://localhost:3000,http://localhost:3100/menu/x".
 */
export function publicAppUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
}

/**
 * The public base URL of this API, used to make stored asset paths absolute.
 *
 * Generated documents are rendered outside this origin — in a sandboxed
 * srcDoc iframe, in a downloaded file, on a deployed site. A relative
 * "/uploads/x.webp" resolves against whatever page is hosting the document, so
 * every generated image came out broken. Emitting absolute URLs fixes all of
 * those consumers at once.
 */
export function publicApiUrl(): string {
  const configured = (process.env.PUBLIC_API_URL || process.env.API_URL || '').trim();
  if (configured) return configured.split(',')[0].trim().replace(/\/+$/, '');

  // Falling back to localhost in production would bake "http://localhost:4000"
  // into every published menu and website — the images would be broken for
  // everyone but the person running the server. Fail at boot instead, where
  // it is obvious, rather than silently shipping dead URLs.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'PUBLIC_API_URL doit etre defini en production (ex: https://api.mondomaine.com). ' +
        'Les documents publies y referencent leurs images.',
    );
  }

  return `http://localhost:${process.env.PORT || 4000}`;
}

/**
 * Check the configuration at boot rather than at the first generation.
 * Called from main.ts so a misconfigured deployment fails immediately.
 */
export function assertPublicUrlsConfigured(): void {
  const api = publicApiUrl();
  const app = publicAppUrl();
  for (const [name, value] of [['PUBLIC_API_URL', api], ['FRONTEND_URL', app]]) {
    if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(value)) {
      throw new Error(`${name} pointe sur ${value}, inutilisable en production.`);
    }
    try {
      // eslint-disable-next-line no-new
      new URL(value);
    } catch {
      throw new Error(`${name} n'est pas une URL valide: ${value}`);
    }
  }
}

/** "/uploads/x.webp" -> "https://api.example.com/uploads/x.webp". */
export function absoluteAssetUrl(value?: string | null): string | null {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  return v.startsWith('/uploads/') ? `${publicApiUrl()}${v}` : v;
}

/**
 * "http://api.example.com/uploads/x.webp" -> "/uploads/x.webp" when the URL is
 * one of this server's own uploads, so it is read from disk instead of being
 * fetched over the network (which the SSRF guard would refuse on localhost).
 */
export function toLocalUploadPath(url: string): string {
  const prefix = `${publicApiUrl()}/uploads/`;
  return url.startsWith(prefix) ? url.slice(publicApiUrl().length) : url;
}
