const encoder = new TextEncoder();

function graphemes(value: string): string[] {
  const Segmenter = Intl.Segmenter;
  return Array.from(new Segmenter("uz", { granularity: "grapheme" }).segment(value), (item) => item.segment);
}

/** Split Instagram messages at natural boundaries without exceeding 1,000 UTF-8 bytes. */
export function splitInstagramReply(value: string, byteLimit = 1000, maxParts = 3): string[] {
  const remaining = graphemes(value.trim());
  const result: string[] = [];

  while (remaining.length > 0 && result.length < maxParts) {
    let bytes = 0;
    let end = 0;
    while (end < remaining.length) {
      const nextBytes = encoder.encode(remaining[end]).length;
      if (bytes + nextBytes > byteLimit) break;
      bytes += nextBytes;
      end += 1;
    }
    if (end === 0) break;

    if (end < remaining.length) {
      const boundary = remaining
        .slice(0, end)
        .reduce((last, part, index) => (/\s/.test(part) ? index + 1 : last), 0);
      if (boundary > end * 0.55) end = boundary;
    }

    const part = remaining.splice(0, end).join("").trim();
    if (part) result.push(part);
    while (remaining.length && /^\s+$/.test(remaining[0])) remaining.shift();
  }

  if (remaining.length && result.length === maxParts) {
    const last = result.pop() ?? "";
    const units = graphemes(last);
    while (units.length && encoder.encode(`${units.join("")}…`).length > byteLimit) units.pop();
    result.push(`${units.join("").trimEnd()}…`);
  }

  return result;
}
