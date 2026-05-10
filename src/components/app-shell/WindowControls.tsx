import { Minus, Square, X } from "lucide-react";
import { type ReactNode } from "react";
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from "@/services/desktop/window";
import { cn } from "@/lib/utils";

const isMacPlatform =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

function WindowButton({
  children,
  className,
  label,
  onClick,
  title,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "app-no-drag inline-flex h-8 w-10 items-center justify-center text-gray-500 transition-colors hover:bg-black/[0.06] hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100",
        className,
      )}
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function WindowControls() {
  if (isMacPlatform) {
    return null;
  }

  return (
    <div className="app-no-drag fixed right-0 top-0 z-50 flex h-9 flex-shrink-0 items-center justify-end">
      <WindowButton label="最小化窗口" title="最小化" onClick={() => void minimizeWindow()}>
        <Minus className="h-3.5 w-3.5" />
      </WindowButton>
      <WindowButton label="最大化窗口" title="最大化" onClick={() => void toggleMaximizeWindow()}>
        <Square className="h-3 w-3" />
      </WindowButton>
      <WindowButton
        label="关闭窗口"
        title="关闭"
        onClick={() => void closeWindow()}
        className="hover:bg-red-500 hover:text-white dark:hover:bg-red-500 dark:hover:text-white"
      >
        <X className="h-4 w-4" />
      </WindowButton>
    </div>
  );
}
