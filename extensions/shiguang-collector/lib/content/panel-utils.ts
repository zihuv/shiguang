// 拾光采集器 - 页面内面板工具

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function parseOptionalInt(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const IMAGE_DATA_ATTRIBUTES = [
  "full",
  "fullSize",
  "large",
  "original",
  "originalSrc",
  "src",
  "lazy",
  "pinMedia",
  "image",
  "url",
];

function parseSrcset(srcset, collector) {
  if (typeof srcset !== "string" || !srcset.trim()) {
    return null;
  }

  const candidates = srcset
    .split(",")
    .map((candidate) => {
      const parts = candidate.trim().split(/\s+/);
      const url = parts[0];
      const descriptor = parts[1] || "";
      const width = descriptor.endsWith("w") ? Number.parseInt(descriptor, 10) : 0;
      const density = descriptor.endsWith("x") ? Number.parseFloat(descriptor) : 0;
      return {
        url,
        score: Number.isFinite(width) && width > 0 ? width : density * 1000,
      };
    })
    .filter((candidate) => candidate.url);

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score);
  return collector.normalizeImageUrl(candidates[0].url);
}

export function scanPageImages(collector) {
  const images = new Map();

  function addImage(url, width = 0, height = 0, sourceElement = null) {
    const payload = collector.resolveCollectionPayload?.(sourceElement, url, {
      pageUrl: window.location.href,
    });
    const normalized = collector.normalizeImageUrl(payload?.imageUrl || url);
    if (!normalized || !/^https?:\/\//i.test(normalized)) {
      return;
    }

    const sourceUrl = payload?.sourceUrl || null;
    const metadata = payload?.metadata || null;

    if (!images.has(normalized)) {
      images.set(normalized, {
        url: normalized,
        width,
        height,
        sourceUrl,
        metadata,
      });
    } else {
      if (sourceUrl && !images.get(normalized).sourceUrl) {
        images.get(normalized).sourceUrl = sourceUrl;
      }
      if (metadata && !images.get(normalized).metadata) {
        images.get(normalized).metadata = metadata;
      }
    }
  }

  document.querySelectorAll("img").forEach((img) => {
    addImage(
      collector.getImageUrlFromElement?.(img),
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      img,
    );
    addImage(
      img.currentSrc || img.src,
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      img,
    );
    addImage(
      parseSrcset(img.getAttribute("srcset"), collector),
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      img,
    );
    addImage(
      parseSrcset(img.dataset.srcset, collector),
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      img,
    );
    addImage(img.dataset.src, img.naturalWidth || img.width, img.naturalHeight || img.height, img);
    addImage(
      img.dataset.original,
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      img,
    );
    addImage(img.dataset.lazy, img.naturalWidth || img.width, img.naturalHeight || img.height, img);
    for (const attribute of IMAGE_DATA_ATTRIBUTES) {
      addImage(
        img.dataset[attribute],
        img.naturalWidth || img.width,
        img.naturalHeight || img.height,
        img,
      );
    }
  });

  document.querySelectorAll("source[srcset]").forEach((source) => {
    addImage(parseSrcset(source.getAttribute("srcset"), collector), 0, 0, source);
  });

  document
    .querySelectorAll(
      "[data-src], [data-original], [data-lazy], [data-large], [data-full], [data-full-size], [data-original-src], [data-srcset], [data-pin-media], [data-image]",
    )
    .forEach((element) => {
      addImage(collector.getImageUrlFromElement?.(element), 0, 0, element);
      addImage(parseSrcset(element.dataset.srcset, collector), 0, 0, element);
      for (const attribute of IMAGE_DATA_ATTRIBUTES) {
        addImage(element.dataset[attribute], 0, 0, element);
      }
    });

  document.querySelectorAll("*").forEach((element) => {
    const style = window.getComputedStyle(element);
    const backgroundImage = style.backgroundImage;
    if (!backgroundImage || backgroundImage === "none") {
      return;
    }

    for (const match of backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
      addImage(match[1], element.clientWidth, element.clientHeight, element);
    }
  });

  return [...images.values()];
}

export function cropDataUrl(dataUrl, rect) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scaleX = image.naturalWidth / window.innerWidth;
      const scaleY = image.naturalHeight / window.innerHeight;
      const sourceX = Math.max(0, Math.round(rect.left * scaleX));
      const sourceY = Math.max(0, Math.round(rect.top * scaleY));
      const sourceWidth = Math.max(1, Math.round(rect.width * scaleX));
      const sourceHeight = Math.max(1, Math.round(rect.height * scaleY));

      const canvas = document.createElement("canvas");
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      const context = canvas.getContext("2d");
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight,
      );
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("截图裁剪失败"));
    image.src = dataUrl;
  });
}
