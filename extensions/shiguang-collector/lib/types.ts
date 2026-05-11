export type ToastType = "success" | "error" | "info";

export interface CollectionMetadata {
  title: string;
  description: string;
  author: string;
  authorUrl: string | null;
  provider: string;
  license: string;
  canonicalUrl: string | null;
  publishedAt: string;
  location: string;
  camera: string;
  width: number;
  height: number;
  tags: string[];
}

export type PartialCollectionMetadata = Partial<
  Omit<CollectionMetadata, "tags"> & { tags: unknown[] }
>;

export interface CollectionContext {
  target: EventTarget | Node | null;
  imageUrl: string;
  pageUrl: string;
  sourceUrl: string | null;
}

export interface CollectionPayload {
  imageUrl: string;
  candidateUrls: string[];
  sourceUrl: string;
  metadata: CollectionMetadata | null;
}

export interface ResolvedCollectionPayload {
  imageUrl?: string | null;
  candidateUrls?: Array<string | null | undefined>;
  sourceUrl?: string | null;
  metadata?: PartialCollectionMetadata | null;
}

export interface SiteMetadataService {
  resolveCollectionPayload(input: {
    target?: EventTarget | Node | null;
    imageUrl?: string | null;
    pageUrl?: string | null;
    sourceUrl?: string | null;
  }): ResolvedCollectionPayload;
}

export interface RequestCollectImageOptions {
  collectionPayload?: CollectionPayload | null;
  target?: EventTarget | Node | null;
  sourceUrl?: string | null;
  referer?: string | null;
  renderedImageDataUrl?: string | null;
  missingImageMessage?: string;
  notifyOnError?: boolean;
  notifyOnSuccess?: boolean;
  successMessage?: string;
  folderId?: string | number | null;
  targetFolderResolved?: boolean;
  forceTargetFolder?: boolean;
  waitForCompletion?: boolean;
}

export interface CollectImageResponse {
  success?: boolean;
  cancelled?: boolean;
  error?: string;
  result?: unknown;
  deduped?: boolean;
  queued?: boolean;
}

export interface Collector {
  state: {
    lastImageUrl: string | null;
    lastRightClickTarget: EventTarget | Node | null;
    lastSourceUrl: string | null;
    lastCollectionPayload: CollectionPayload | null;
  };
  showToast(message: string, type?: ToastType, duration?: number): void;
  getErrorMessage(error: unknown): string;
  requestCollectImage(
    imageUrl: string,
    options?: RequestCollectImageOptions,
  ): Promise<CollectImageResponse>;
  normalizeImageUrl(url: unknown): string | null;
  extractImageUrlFromDragEvent(event: DragEvent): string | null;
  getImageUrlFromElement(target: EventTarget | Node | null): string | null;
  getImageUrlFromPoint?(x: number, y: number): string | null;
  resolveSourceUrlFromElement(target: EventTarget | Node | null, imageUrl: string): string | null;
  resolveCollectionPayload(
    target: EventTarget | Node | null,
    imageUrl: string | null | undefined,
    options?: { sourceUrl?: string | null; pageUrl?: string | null },
  ): CollectionPayload | null;
  registerSourceUrlResolver(resolver: (element: Element, imageUrl: string) => string | null): void;
  setLastImageContext(
    target: EventTarget | Node | null,
    imageUrl: string | null | undefined,
    sourceUrl?: string | null,
  ): CollectionPayload | null;
  getLastImageUrl(): string | null;
  getLastSourceUrl(): string | null;
  getLastCollectionPayload(): CollectionPayload | null;
  getLastRightClickTarget(): EventTarget | Node | null;
  getRenderedImageDataUrl(
    target: EventTarget | Node | null,
    imageUrl: string | null,
  ): string | null;
}

export interface FolderRecord {
  id: string | number;
  name: string;
  parentId?: string | number | null;
  children?: FolderRecord[];
}

export interface FolderTarget {
  id: string;
  folderId: string;
  name: string;
  depth: number;
  pathLabel: string;
}

export interface DragDock {
  showDragDock(
    imageUrl: string,
    referer?: string,
    sourceUrl?: string,
    collectionPayload?: CollectionPayload | null,
    dragPoint?: { clientX: number; clientY: number } | null,
  ): void;
  hideDragDock(force?: boolean): void;
  scheduleHide(delay?: number): void;
  isEnabled(): boolean;
}

export interface CollectorPanel {
  togglePanel(): void;
  openPanel(view?: string): void;
  closePanel(): void;
  selectTargetFolder(): Promise<{
    success?: boolean;
    cancelled?: boolean;
    error?: string;
    folderId?: string;
  }>;
  startAreaCapture(): void;
  startElementCapture(): void;
  captureVisibleScreenshot(): Promise<boolean>;
}
