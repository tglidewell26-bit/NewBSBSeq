// Presentation only: saved, validated sequence records remain unchanged.
export function cleanSequenceBody(body: string): string {
  return body.replace(/^Times: (?:[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+|UTC|GMT)[ \t]*\r?\n?/gm, "");
}

export function sequenceBodyParts(body: string): Array<{ text: string; href?: string }> {
  const source = cleanSequenceBody(body);
  const parts: Array<{ text: string; href?: string }> = [];
  const links = /\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g;
  let end = 0;
  for (const match of source.matchAll(links)) {
    const href = match[2];
    // Only HTTPS host URLs; reject credentials, backslashes and control space.
    if (!/^https:\/\/[a-z0-9.-]+(?::\d{1,5})?(?:[/?#][^\s\\]*)?$/i.test(href)) continue;
    parts.push({ text: source.slice(end, match.index) }, { text: match[1], href });
    end = match.index! + match[0].length;
  }
  parts.push({ text: source.slice(end) });
  return parts;
}

export function sequenceBodyText(body: string): string {
  return sequenceBodyParts(body).map(p => p.href ? `${p.text} (${p.href})` : p.text).join("");
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function sequenceBodyHtml(body: string): string {
  return `<div>${sequenceBodyParts(body).map(p => p.href
    ? `<a href="${escapeHtml(p.href)}">${escapeHtml(p.text)}</a>`
    : escapeHtml(p.text).replace(/\r?\n/g, "<br>")).join("")}</div>`;
}
