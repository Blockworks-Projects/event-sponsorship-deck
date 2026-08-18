/**
 * The rep's note to the sponsor, with links.
 *
 * Notes are typed into a plain textarea, so the syntax has to be something a
 * seller will remember: `[label](url)` when the link needs words, and a bare
 * URL pasted straight in otherwise. Everything else stays literal text —
 * this is deliberately not a markdown renderer, because a note that grew
 * headings and bold would stop matching the type around it.
 */

/** One pass finds both forms. Group 1/2 are the labelled link's parts, group 3
 * a bare URL. `www.` is accepted unschemed because that's how a URL arrives
 * when it's been copied out of an email signature. */
const LINK =
  /\[([^\]]+)\]\((https?:\/\/[^\s)]+|www\.[^\s)]+)\)|(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

/** Sentence punctuation that followed the URL rather than belonging to it, plus
 * a closing paren the URL never opened — "(see https://x.com/a)" ends the link
 * at `a`, but https://x.com/a_(b) keeps its pair. */
function trimTrailing(url: string): string {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if ('.,;:!?\'"'.includes(ch)) {
      end--;
      continue;
    }
    if (ch === ')') {
      const inner = url.slice(0, end);
      const opens = (inner.match(/\(/g) ?? []).length;
      const closes = (inner.match(/\)/g) ?? []).length;
      if (closes > opens) {
        end--;
        continue;
      }
    }
    break;
  }
  return url.slice(0, end);
}

/** Only http(s) ever reaches an href — the regex can't match a `javascript:`
 * or `data:` URL, so a note can't smuggle one into the public page. */
function href(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function NoteText({ text, accent }: { text: string; accent: string }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const m of text.matchAll(LINK)) {
    const at = m.index ?? 0;
    // A labelled link is exact; a bare one may have swallowed the punctuation
    // that ended the sentence, which goes back into the surrounding text.
    const labelled = m[1] !== undefined;
    const raw = labelled ? m[2] : m[3];
    const url = labelled ? raw : trimTrailing(raw);
    const label = labelled ? m[1] : url;

    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <a
        key={at}
        href={href(url)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline decoration-1 underline-offset-2"
        style={{ color: accent }}
      >
        {label}
      </a>,
    );
    cursor = at + (labelled ? m[0].length : url.length);
  }

  if (cursor < text.length) parts.push(text.slice(cursor));

  // Line breaks the rep typed are theirs to keep — a note listing two links on
  // two lines shouldn't reflow into one paragraph.
  return <span className="whitespace-pre-line">{parts}</span>;
}
