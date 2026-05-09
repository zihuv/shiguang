import { resolveProvider, internals as ruleInternals } from "./site-rules";
import type { CollectionPayload } from "../types";
import {
  cleanTitle,
  getGenericMetadata,
  mergeMetadata,
  normalizeText,
  normalizeUrl,
  uniqueStrings,
} from "./site-metadata-utils";

function resolveCollectionPayload(input: {
  target?: EventTarget | Node | null;
  imageUrl?: string | null;
  pageUrl?: string | null;
  sourceUrl?: string | null;
}): CollectionPayload {
  const context = {
    target: input?.target ?? null,
    imageUrl: normalizeUrl(input?.imageUrl, input?.pageUrl) || "",
    pageUrl:
      normalizeUrl(input?.pageUrl) || normalizeUrl(window.location.href) || window.location.href,
    sourceUrl: normalizeUrl(input?.sourceUrl, input?.pageUrl),
  };

  const genericMetadata = getGenericMetadata(context);
  const resolved = resolveProvider(context, genericMetadata);
  const metadata = mergeMetadata(genericMetadata, resolved.metadata || {});
  const imageUrl = context.imageUrl || "";
  const candidateUrls = uniqueStrings(
    [
      ...(Array.isArray(resolved.candidateUrls) ? resolved.candidateUrls : []),
      normalizeUrl(resolved.imageUrl, context.pageUrl),
      imageUrl,
    ].filter(Boolean),
  );

  return {
    imageUrl,
    candidateUrls,
    sourceUrl: normalizeUrl(resolved.sourceUrl, context.pageUrl) || context.pageUrl,
    metadata: {
      ...metadata,
      tags: uniqueStrings(metadata.tags),
    },
  };
}

export const siteMetadata = {
  resolveCollectionPayload,
  internals: {
    cleanTitle,
    mergeMetadata,
    normalizeText,
    normalizeUrl,
    uniqueStrings,
    ...ruleInternals,
  },
};

export { resolveCollectionPayload };
