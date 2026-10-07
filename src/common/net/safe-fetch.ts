import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * fetch() for URLs that came from a user (a logo link, an image to import).
 *
 * A plain fetch of user input is an SSRF: it lets anyone make this server call
 * 169.254.169.254 (cloud metadata), localhost:5432, or the office network and
 * read the answer back as an "image". Here every hop — the first URL and each
 * redirect, followed by hand — must be http(s) and resolve to a public address,
 * and the body is capped so a huge download cannot exhaust memory.
 *
 * DNS is resolved before connecting, so a rebinding attack between the check
 * and the request is still conceivable; this closes the direct routes.
 */

const MAX_REDIRECTS = 4;
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    v.startsWith('fc') ||
    v.startsWith('fd') || // unique local
    v.startsWith('fe8') ||
    v.startsWith('fe9') ||
    v.startsWith('fea') ||
    v.startsWith('feb') || // link-local
    v.startsWith('ff') // multicast
  );
}

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !isPrivateIPv4(ip);
  if (family === 6) return !isPrivateIPv6(ip);
  return false;
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Protocole refusé: ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((r) => r.address);
  if (!addresses.length || !addresses.every(isPublicAddress)) {
    throw new Error(`Hôte non autorisé: ${url.hostname}`);
  }
}

/** Download a user-supplied URL as bytes, or null if refused or failed. */
export async function safeFetchBuffer(
  rawUrl: string,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<Buffer | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(url);
      const res = await fetch(url, { redirect: 'manual', signal: controller.signal });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return null;
        url = new URL(location, url);
        continue;
      }
      if (!res.ok) return null;

      const declared = Number(res.headers.get('content-length') || 0);
      if (declared > maxBytes) return null;
      const body = Buffer.from(await res.arrayBuffer());
      return body.length > maxBytes ? null : body;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
