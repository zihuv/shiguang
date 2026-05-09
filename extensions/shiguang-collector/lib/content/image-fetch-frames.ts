const imageFetchFrames = new Map<string, HTMLIFrameElement>();

export function createImageFetchFrame(id: string, url: string): boolean {
  if (!id || !/^https?:\/\//i.test(url)) {
    return false;
  }

  imageFetchFrames.get(id)?.remove();
  const frame = document.createElement("iframe");
  frame.id = id;
  frame.src = url;
  frame.sandbox.add("allow-scripts", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = [
    "position: fixed",
    "left: -100000px",
    "top: 0",
    "width: 1px",
    "height: 1px",
    "border: 0",
    "opacity: 0",
    "pointer-events: none",
  ].join(";");
  imageFetchFrames.set(id, frame);
  (document.body || document.documentElement).appendChild(frame);
  return true;
}

export function removeImageFetchFrame(id: string): boolean {
  const frame = imageFetchFrames.get(id);
  if (!frame) {
    return false;
  }

  frame.remove();
  imageFetchFrames.delete(id);
  return true;
}
