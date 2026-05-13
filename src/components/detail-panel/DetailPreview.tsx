import FileTypeIcon from "@/components/FileTypeIcon";
import type { FileItem } from "@/stores/fileTypes";
import type { FilePreviewMode } from "@/utils";

interface DetailPreviewProps {
  file: FileItem;
  imageSrc: string;
  isImageOriginalOpen: boolean;
  onOpenOriginalImage: () => void | Promise<void>;
  previewError: boolean;
  previewType: FilePreviewMode;
  textContent: string;
  usesThumbnailPreview: boolean;
  videoPosterSrc: string;
}

function PreviewLoadError() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
      <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <p className="text-[13px]">预览加载失败</p>
    </div>
  );
}

function GenericFilePreview({ file }: { file: FileItem }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
      <FileTypeIcon ext={file.ext} className="h-12 w-12" />
      <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-medium dark:bg-black/20">
        {file.ext.toUpperCase()}
      </span>
    </div>
  );
}

function ThumbnailPreview({
  file,
  imageSrc,
  isImageOriginalOpen,
  onOpenOriginalImage,
  previewError,
  previewType,
}: Pick<
  DetailPreviewProps,
  | "file"
  | "imageSrc"
  | "isImageOriginalOpen"
  | "onOpenOriginalImage"
  | "previewError"
  | "previewType"
>) {
  const canOpenOriginal = previewType === "image" && !isImageOriginalOpen;

  return (
    <div
      onDoubleClick={canOpenOriginal ? () => void onOpenOriginalImage() : undefined}
      className={`relative h-full w-full bg-gray-100 dark:bg-dark-bg ${
        canOpenOriginal ? "cursor-zoom-in" : ""
      }`}
      title={canOpenOriginal ? "双击加载原图" : undefined}
    >
      {imageSrc ? (
        <img src={imageSrc} alt={file.name} className="w-full h-full object-contain" />
      ) : previewError ? (
        <PreviewLoadError />
      ) : (
        <div className="h-full w-full" />
      )}
    </div>
  );
}

function VideoPreview({
  file,
  videoPosterSrc,
}: Pick<DetailPreviewProps, "file" | "videoPosterSrc">) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {videoPosterSrc ? (
        <img src={videoPosterSrc} alt={file.name} className="h-full w-full object-cover" />
      ) : (
        <GenericFilePreview file={file} />
      )}
    </div>
  );
}

function TextPreview({ textContent }: { textContent: string }) {
  return (
    <div className="h-full w-full overflow-auto bg-white p-3 dark:bg-dark-surface">
      <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-gray-700 dark:text-gray-200">
        {textContent || "空文本文件"}
      </pre>
    </div>
  );
}

export function DetailPreview(props: DetailPreviewProps) {
  const { file, previewError, previewType, textContent, usesThumbnailPreview } = props;

  return (
    <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-[20px] bg-black/[0.045] dark:bg-white/[0.045]">
      {usesThumbnailPreview ? (
        <ThumbnailPreview {...props} />
      ) : previewType === "video" ? (
        <VideoPreview {...props} />
      ) : previewError && previewType !== "none" ? (
        <PreviewLoadError />
      ) : previewType === "text" ? (
        <TextPreview textContent={textContent} />
      ) : (
        <GenericFilePreview file={file} />
      )}
    </div>
  );
}
