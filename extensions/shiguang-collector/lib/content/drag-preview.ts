interface DragPreviewSize {
  width: number;
  height: number;
}

const DRAG_PREVIEW_ID = "shiguang-drag-preview-container";
const DRAG_PREVIEW_MAX_SIZE = 112;

function findPreviewImageElement(target: EventTarget | Node | null): HTMLImageElement | null {
  const element =
    target instanceof Node && target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
  if (!(element instanceof Element)) {
    return null;
  }

  if (element instanceof HTMLImageElement && element.currentSrc) {
    return element;
  }

  return element.querySelector<HTMLImageElement>("img");
}

function ensureDragPreviewContainer(): HTMLElement {
  let container = document.getElementById(DRAG_PREVIEW_ID);
  if (container) {
    return container;
  }

  container = document.createElement("div");
  container.id = DRAG_PREVIEW_ID;
  container.setAttribute("aria-hidden", "true");
  container.style.cssText = [
    "position: fixed",
    "top: -100000px",
    "left: 0",
    "pointer-events: none",
  ].join(";");
  (document.body || document.documentElement).appendChild(container);
  return container;
}

function getCompactDragPreviewSize(image: HTMLImageElement): DragPreviewSize | null {
  const width = image.naturalWidth || image.width || image.getBoundingClientRect().width;
  const height = image.naturalHeight || image.height || image.getBoundingClientRect().height;
  if (!width || !height) {
    return null;
  }

  const scale = Math.min(1, DRAG_PREVIEW_MAX_SIZE / Math.max(width, height));
  return {
    height: Math.max(24, Math.round(height * scale)),
    width: Math.max(24, Math.round(width * scale)),
  };
}

function createCanvasDragPreview(
  image: HTMLImageElement,
  size: DragPreviewSize,
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.round(size.width * pixelRatio);
  canvas.height = Math.round(size.height * pixelRatio);
  canvas.style.cssText = [
    `width: ${size.width}px`,
    `height: ${size.height}px`,
    "display: block",
    "border-radius: 8px",
    "box-shadow: 0 8px 18px rgba(15, 23, 42, 0.24)",
  ].join(";");

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.scale(pixelRatio, pixelRatio);
  context.drawImage(image, 0, 0, size.width, size.height);
  return canvas;
}

function createCloneDragPreview(image: HTMLImageElement, size: DragPreviewSize): HTMLImageElement {
  const preview = image.cloneNode(false) as HTMLImageElement;
  preview.removeAttribute("id");
  preview.src = image.currentSrc || image.src;
  preview.style.cssText = [
    `width: ${size.width}px`,
    `height: ${size.height}px`,
    "display: block",
    "object-fit: cover",
    "border-radius: 8px",
    "box-shadow: 0 8px 18px rgba(15, 23, 42, 0.24)",
    "background: #fff",
  ].join(";");
  return preview;
}

export function setCompactDragImage(event: DragEvent, target: EventTarget | Node | null): void {
  const image = findPreviewImageElement(target);
  if (!event.dataTransfer || !image) {
    return;
  }

  const size = getCompactDragPreviewSize(image);
  if (!size) {
    return;
  }

  let preview: HTMLElement | null = null;
  try {
    preview = createCanvasDragPreview(image, size);
  } catch (error) {
    console.warn("创建拖拽缩略图失败，回退到图片节点:", error);
  }
  preview = preview || createCloneDragPreview(image, size);

  const container = ensureDragPreviewContainer();
  container.textContent = "";
  container.appendChild(preview);
  event.dataTransfer.setDragImage(preview, 0, 0);
}
