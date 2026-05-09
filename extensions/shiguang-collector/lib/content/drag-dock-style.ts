// 拾光采集器 - 拖拽收藏浮层样式

export const dragDockStyle = `
  #shiguang-drag-dock {
    position: fixed;
    left: -10000px;
    top: -10000px;
    display: none;
    z-index: 2147483646;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
  }

  #shiguang-drag-dock.shiguang-drag-dock--visible {
    display: flex;
  }

  #shiguang-drag-dock,
  #shiguang-drag-dock * {
    box-sizing: border-box;
  }

  .shiguang-drag-dock__card {
    display: flex;
    width: min(520px, calc(100vw - 24px));
    min-height: 238px;
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid rgba(15, 23, 42, 0.12);
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 20px 46px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(18px);
    color: #1f2937;
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    cursor: copy;
    opacity: 0;
    transform: translateX(8px) scale(0.98);
    transition:
      opacity 0.18s ease,
      transform 0.18s ease,
      box-shadow 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease;
    pointer-events: none;
  }

  #shiguang-drag-dock.shiguang-drag-dock--visible .shiguang-drag-dock__card {
    opacity: 1;
    transform: translateX(0) scale(1);
  }

  #shiguang-drag-dock.shiguang-drag-dock--interactive .shiguang-drag-dock__card {
    pointer-events: auto;
  }

  #shiguang-drag-dock.shiguang-drag-dock--active .shiguang-drag-dock__card {
    border-color: rgba(212, 175, 55, 0.50);
    box-shadow:
      0 24px 52px rgba(15, 23, 42, 0.20),
      0 0 0 1px rgba(212, 175, 55, 0.16);
  }

  .shiguang-drag-dock__left {
    display: flex;
    width: 244px;
    padding: 14px;
    background: #fafafa;
    border-right: 1px solid rgba(15, 23, 42, 0.10);
    flex-shrink: 0;
  }

  .shiguang-drag-dock__default-target {
    width: 100%;
    min-height: 210px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    border-radius: 8px;
    border: 1px dashed rgba(15, 23, 42, 0.16);
    background: #ffffff;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.92);
    transition:
      background 0.16s ease,
      border-color 0.16s ease,
      box-shadow 0.16s ease;
  }

  .shiguang-drag-dock__default-target.is-active {
    border-color: #d4af37;
    background: #fff8e6;
    box-shadow: inset 0 0 0 1px rgba(212, 175, 55, 0.24);
  }

  .shiguang-drag-dock__folder-icon {
    position: relative;
    width: 116px;
    height: 86px;
    opacity: 0.72;
  }

  .shiguang-drag-dock__folder-tab {
    position: absolute;
    left: 18px;
    top: 10px;
    width: 48px;
    height: 18px;
    border-radius: 8px 8px 0 0;
    border: 1px solid #cbd5e1;
    border-bottom: 0;
    background: linear-gradient(180deg, #f8fafc, #edf2f7);
  }

  .shiguang-drag-dock__folder-body {
    position: absolute;
    left: 8px;
    right: 8px;
    top: 26px;
    height: 50px;
    border-radius: 10px;
    border: 1px solid #cbd5e1;
    background: linear-gradient(180deg, #ffffff, #f1f5f9);
    box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
  }

  .shiguang-drag-dock__folder-mark {
    position: absolute;
    left: 50%;
    top: 44px;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    transform: translateX(-50%);
    border: 1px solid #94a3b8;
    background:
      radial-gradient(circle at 65% 35%, transparent 0 12px, #e2e8f0 13px),
      conic-gradient(from 30deg, #f8fafc, #cbd5e1, #f8fafc);
  }

  .shiguang-drag-dock__left-title {
    color: #8a8f98;
    font-size: 13px;
    font-weight: 400;
    text-align: center;
  }

  .shiguang-drag-dock__default-label {
    margin-top: -8px;
    color: #6b7280;
    font-size: 12px;
    text-align: center;
  }

  .shiguang-drag-dock__right {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    background: #ffffff;
  }

  .shiguang-drag-dock__right-title {
    min-height: 40px;
    display: flex;
    align-items: center;
    padding: 0 16px;
    color: #6b7280;
    font-size: 12px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  }

  .shiguang-drag-dock__folder-wrap {
    position: relative;
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .shiguang-drag-dock__folder-list {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    gap: 4px;
    max-height: min(176px, calc(100vh - 170px));
    overflow: auto;
    padding: 10px;
  }

  .shiguang-drag-dock__folder-list[hidden],
  .shiguang-drag-dock__folder-status[hidden] {
    display: none !important;
  }

  .shiguang-drag-dock__folder-status {
    min-height: 176px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    color: #9ca3af;
    font-size: 13px;
    text-align: center;
  }

  .shiguang-drag-dock__folder-target {
    min-width: 0;
    height: 38px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: #1f2937;
    padding: 0 9px 0 var(--shiguang-folder-target-left, 10px);
    font: inherit;
    cursor: copy;
    transition:
      background 0.16s ease,
      border-color 0.16s ease,
      transform 0.16s ease;
  }

  .shiguang-drag-dock__folder-target.is-active {
    border-color: #d4af37;
    background: #fff8e6;
    transform: translateY(-1px);
  }

  .shiguang-drag-dock__folder-marker {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    background: #c6a94e;
    box-shadow: 0 0 0 3px rgba(198, 169, 78, 0.12);
    flex-shrink: 0;
  }

  .shiguang-drag-dock__folder-label {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .shiguang-drag-dock__footer {
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    border-top: 1px solid rgba(15, 23, 42, 0.08);
    color: #374151;
    font-size: 13px;
    background: #ffffff;
  }

  .shiguang-drag-dock__plus {
    font-size: 18px;
    line-height: 1;
    color: #111827;
    flex-shrink: 0;
  }

  .shiguang-drag-dock__footer-text {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  @media (prefers-reduced-motion: reduce) {
    .shiguang-drag-dock__card,
    .shiguang-drag-dock__default-target,
    .shiguang-drag-dock__folder-target {
      transition: none;
    }
  }
`;
