import { BrowserWindow, ipcMain, type Rectangle } from "electron";
import sharp from "sharp";

const DOCX_RENDER_TIMEOUT_MS = 15_000;
const DOCX_RENDERER_WIDTH = 1200;
const DOCX_RENDERER_HEIGHT = 1700;
const DOCX_RENDER_CHANNEL = "shiguang:docx-thumbnail-render";
const DOCX_RESULT_CHANNEL = "shiguang:docx-thumbnail-result";

interface DocxRenderResult {
  ok: boolean;
  clip?: Rectangle;
  error?: string;
}

interface BlankImageStats {
  min: number;
  max: number;
  unique: number;
}

let docxWindow: BrowserWindow | null = null;
let docxRenderQueue: Promise<Buffer> = Promise.resolve(Buffer.alloc(0));

export async function getBlankImageStats(buffer: Buffer): Promise<BlankImageStats> {
  const image = await sharp(buffer)
    .resize(64, 64, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let min = 255;
  let max = 0;
  const values = new Set<number>();
  for (let index = 0; index + 2 < image.data.length; index += image.info.channels) {
    const value = Math.round(
      (image.data[index] + image.data[index + 1] + image.data[index + 2]) / 3,
    );
    min = Math.min(min, value);
    max = Math.max(max, value);
    values.add(value);
  }

  return { min, max, unique: values.size };
}

export async function isVisuallyBlankImage(buffer: Buffer): Promise<boolean> {
  const stats = await getBlankImageStats(buffer);
  return stats.max - stats.min < 8 && stats.unique <= 8;
}

function createDocxRendererHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        background: #eef2f7;
        overflow: hidden;
      }

      #root {
        display: inline-block;
      }

      .docx-wrapper {
        background: #eef2f7 !important;
        padding: 0 !important;
      }

      .docx-wrapper > section.docx {
        margin: 0 !important;
        box-shadow: none !important;
      }
    </style>
  </head>
  <body>
    <div id="styles"></div>
    <div id="root"></div>
    <script>
      const { ipcRenderer } = require("electron");
      const docx = require("docx-preview");

      function waitForImages(root) {
        const images = Array.from(root.querySelectorAll("img"));
        return Promise.all(
          images.map((image) => {
            if (image.complete) {
              return Promise.resolve();
            }
            return new Promise((resolve) => {
              image.onload = resolve;
              image.onerror = resolve;
            });
          }),
        );
      }

      ipcRenderer.on("${DOCX_RENDER_CHANNEL}", async (_event, request) => {
        const root = document.getElementById("root");
        const styles = document.getElementById("styles");
        root.replaceChildren();
        styles.replaceChildren();

        try {
          await docx.renderAsync(new Uint8Array(request.bytes), root, styles, {
            breakPages: true,
            className: "docx",
            ignoreFonts: false,
            ignoreHeight: false,
            ignoreWidth: false,
            inWrapper: true,
            renderAltChunks: true,
            renderComments: false,
            renderEndnotes: true,
            renderFooters: true,
            renderFootnotes: true,
            renderHeaders: true,
            trimXmlDeclaration: true,
            useBase64URL: true,
          });
          if (document.fonts?.ready) {
            await document.fonts.ready;
          }
          await waitForImages(root);
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));

          const page =
            root.querySelector(".docx-wrapper > section.docx") ??
            root.querySelector("section.docx") ??
            root.firstElementChild;
          if (!page) {
            throw new Error("DOCX renderer produced no page");
          }

          const rect = page.getBoundingClientRect();
          ipcRenderer.send("${DOCX_RESULT_CHANNEL}", {
            ok: true,
            clip: {
              x: Math.max(0, Math.floor(rect.left)),
              y: Math.max(0, Math.floor(rect.top)),
              width: Math.max(1, Math.ceil(rect.width)),
              height: Math.max(1, Math.ceil(rect.height)),
            },
          });
        } catch (error) {
          ipcRenderer.send("${DOCX_RESULT_CHANNEL}", {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    </script>
  </body>
</html>`;
}

async function getDocxRenderWindow(): Promise<BrowserWindow> {
  if (docxWindow && !docxWindow.isDestroyed()) {
    return docxWindow;
  }

  const window = new BrowserWindow({
    show: false,
    width: DOCX_RENDERER_WIDTH,
    height: DOCX_RENDERER_HEIGHT,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
      webSecurity: true,
    },
  });
  docxWindow = window;
  window.on("closed", () => {
    if (docxWindow === window) {
      docxWindow = null;
    }
  });

  await window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(createDocxRendererHtml())}`,
  );
  return window;
}

async function renderDocxPreviewThumbnailPngBufferNow(buffer: Buffer): Promise<Buffer> {
  const window = await getDocxRenderWindow();
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const result = await new Promise<DocxRenderResult>((resolve) => {
    const timeout = setTimeout(() => {
      ipcMain.off(DOCX_RESULT_CHANNEL, handleResult);
      resolve({ ok: false, error: "DOCX render timed out" });
    }, DOCX_RENDER_TIMEOUT_MS);

    function handleResult(_event: Electron.IpcMainEvent, payload: DocxRenderResult): void {
      clearTimeout(timeout);
      resolve(payload);
    }

    ipcMain.once(DOCX_RESULT_CHANNEL, handleResult);
    window.webContents.send(DOCX_RENDER_CHANNEL, { bytes });
  });

  if (!result.ok || !result.clip) {
    throw new Error(result.error || "DOCX render failed");
  }

  const screenshot = await window.webContents.capturePage(result.clip);
  if (screenshot.isEmpty()) {
    throw new Error("DOCX render produced an empty screenshot");
  }
  const png = screenshot.toPNG();
  if (await isVisuallyBlankImage(png)) {
    throw new Error("DOCX render produced a blank screenshot");
  }
  return png;
}

export function isHighFidelityDocxThumbnailExt(ext: string): boolean {
  return ext.trim().replace(/^\./, "").toLowerCase() === "docx";
}

export function renderDocxPreviewThumbnailPngBuffer(buffer: Buffer): Promise<Buffer> {
  const task = docxRenderQueue
    .catch(() => Buffer.alloc(0))
    .then(() => renderDocxPreviewThumbnailPngBufferNow(buffer));
  docxRenderQueue = task;
  return task;
}
