/**
 * Safe get/set for dot-paths into a WebsiteContent object.
 * Only whitelisted roots are writable, and array indices are bounded,
 * so client-supplied paths can't reach outside the content tree.
 *
 * Arrays are addressed either by numeric index (items.0.name) OR, when the
 * elements carry an `id` (the `sections` array), by that id
 * (sections.<uuid>.data.title). This id-addressing is what the renderer's
 * `data-edit` markers and the editor use.
 */

const WRITABLE_ROOTS = new Set(['meta', 'theme', 'logo', 'contact', 'sections']);

function parse(path: string): (string | number)[] {
  return path
    .split('.')
    .map((seg) => (/^\d+$/.test(seg) ? parseInt(seg, 10) : seg));
}

/** Step into `cur` by `key`, resolving array-by-id where needed. Returns the child or undefined. */
function descend(cur: any, key: string | number): any {
  if (cur == null) return undefined;
  if (Array.isArray(cur)) {
    if (typeof key === 'number') return cur[key];
    return cur.find((el) => el && el.id === key); // address by id
  }
  return cur[key as any];
}

export function getPath(obj: any, path: string): any {
  return parse(path).reduce((acc, key) => descend(acc, key), obj);
}

/** Sets a primitive value at `path`. Returns true if applied. */
export function setPath(root: any, path: string, value: any): boolean {
  const keys = parse(path);
  if (!keys.length || !WRITABLE_ROOTS.has(String(keys[0]))) return false;

  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];

    if (Array.isArray(cur)) {
      // Array elements (sections by id, items/stats/images by index) must
      // already exist — we never fabricate them.
      const child = descend(cur, key);
      if (child == null || typeof child !== 'object') return false;
      cur = child;
      continue;
    }
    if (cur == null || typeof cur !== 'object') return false;
    if (cur[key as any] == null) {
      cur[key as any] = typeof nextKey === 'number' ? [] : {};
    }
    cur = cur[key as any];
  }

  const last = keys[keys.length - 1];
  if (cur == null || typeof cur !== 'object') return false;
  // Setting a primitive leaf: only into an object, or an array by index.
  if (Array.isArray(cur) && typeof last !== 'number') return false;
  cur[last as any] = value;
  return true;
}
