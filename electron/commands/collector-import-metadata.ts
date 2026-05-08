export interface CollectorImportMetadata {
  title?: string;
  description?: string;
  author?: string;
  authorUrl?: string;
  provider?: string;
  license?: string;
  canonicalUrl?: string;
  publishedAt?: string;
  location?: string;
  camera?: string;
  width?: number;
  height?: number;
  tags?: string[];
}

function cleanText(value: unknown, maxLength = 240): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function uniqueTags(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const tags: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const tag = cleanText(value, 48);
    if (!tag) {
      continue;
    }

    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    tags.push(tag);
    if (tags.length >= 12) {
      break;
    }
  }

  return tags;
}

export function parseCollectorImportMetadata(value: unknown): CollectorImportMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const metadata: CollectorImportMetadata = {
    title: cleanText(input.title, 180),
    description: cleanText(input.description, 800),
    author: cleanText(input.author, 120),
    authorUrl: cleanText(input.authorUrl, 400),
    provider: cleanText(input.provider, 80),
    license: cleanText(input.license, 120),
    canonicalUrl: cleanText(input.canonicalUrl, 400),
    publishedAt: cleanText(input.publishedAt, 80),
    location: cleanText(input.location, 160),
    camera: cleanText(input.camera, 160),
    width: Number.isFinite(input.width) ? Number(input.width) : undefined,
    height: Number.isFinite(input.height) ? Number(input.height) : undefined,
    tags: uniqueTags(input.tags),
  };

  return Object.values(metadata).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  )
    ? metadata
    : null;
}

export function buildCollectorImportDescription(
  metadata: CollectorImportMetadata | null,
  sourceUrl: string,
): string {
  if (!metadata) {
    return "";
  }

  const lines: string[] = [];
  const title = cleanText(metadata.title, 180);
  const description = cleanText(metadata.description, 800);

  if (title) {
    lines.push(title);
  }
  if (description && description !== title) {
    lines.push(description);
  }

  const facts = [
    metadata.author ? `作者: ${metadata.author}` : "",
    metadata.tags?.length ? `标签: ${metadata.tags.join(" / ")}` : "",
    metadata.location ? `地点: ${metadata.location}` : "",
    metadata.camera ? `设备: ${metadata.camera}` : "",
    metadata.provider ? `来源站点: ${metadata.provider}` : "",
    metadata.license ? `许可: ${metadata.license}` : "",
    metadata.publishedAt ? `发布时间: ${metadata.publishedAt}` : "",
    metadata.canonicalUrl && metadata.canonicalUrl !== sourceUrl
      ? `原始页面: ${metadata.canonicalUrl}`
      : "",
  ].filter(Boolean);

  for (const fact of facts) {
    if (!lines.includes(fact)) {
      lines.push(fact);
    }
  }

  return lines.join("\n").slice(0, 2000);
}
