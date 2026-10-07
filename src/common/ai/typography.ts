/**
 * Heading capitalisation.
 *
 * Models trained mostly on English write French headings in Title Case
 * ("Ce Que Disent Nos Clients"), which French typography does not use: only
 * the first word and proper nouns take a capital. The prompt asks for
 * sentence case; this repairs what slips through, deterministically.
 */

/** Languages whose headings are written in sentence case. */
const SENTENCE_CASE_LANGUAGES = new Set(['fr', 'es', 'it', 'pt', 'nl', 'de']);

const isCapitalised = (w: string) => /^\p{Lu}\p{Ll}/u.test(w);

/**
 * Words that must keep their capital: proper nouns the business itself wrote
 * with one (its name, and capitalised words inside its own description or
 * address, which are places and names).
 */
export function properNounsFrom(input: {
  /** Names (business, products): every capitalised word is kept. */
  names?: (string | null | undefined)[];
  /** Free text: capitalised words not starting a sentence are kept. */
  texts?: (string | null | undefined)[];
}): Set<string> {
  const keep = new Set<string>();
  const strip = (word: string) => word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  for (const name of input.names || []) {
    for (const word of String(name || '').split(/\s+/)) {
      const clean = strip(word);
      if (isCapitalised(clean)) keep.add(clean);
    }
  }
  for (const source of input.texts || []) {
    const text = String(source || '');
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const words = sentence.split(/\s+/);
      words.forEach((word, i) => {
        const clean = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
        if (i > 0 && isCapitalised(clean)) keep.add(clean);
      });
    }
  }
  return keep;
}

/**
 * Sentence case for a heading written in Title Case; anything else is
 * returned unchanged, so a heading the model already wrote correctly, or one
 * with a single capitalised proper noun, is never touched.
 */
export function toSentenceCase(
  text: string,
  language: string,
  keep: Set<string> = new Set(),
): string {
  if (!SENTENCE_CASE_LANGUAGES.has(String(language || '').slice(0, 2).toLowerCase())) return text;
  const words = String(text || '').split(/(\s+)/);
  const tokens = words.filter((w) => w.trim());
  if (tokens.length < 3) return text;

  // Title Case = most of the words after the first, ignoring short function
  // words, start with a capital.
  // Proper nouns are left out of the count: "Bienvenue Chez Maison Safran"
  // is Title Case because of "Chez", not because of the name.
  const rest = tokens
    .slice(1)
    .map((w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
    .filter((w) => w.length > 3 && !keep.has(w));
  if (!rest.length) return text;
  const capitalised = rest.filter(isCapitalised).length;
  if (capitalised / rest.length < 0.6) return text;

  let seenFirst = false;
  return words
    .map((w) => {
      if (!w.trim()) return w;
      if (!seenFirst) {
        seenFirst = true;
        return w;
      }
      const core = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
      // Keep proper nouns, acronyms and anything that is not simply Title-cased.
      if (!isCapitalised(core) || keep.has(core)) return w;
      return w.replace(core, core.charAt(0).toLocaleLowerCase() + core.slice(1));
    })
    .join('');
}
