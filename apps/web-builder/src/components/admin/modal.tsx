import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useEffect } from "react";

// ------------------------------------------------------------
// 共用的置中 Modal 遮罩：從原本散落在多個檔案（page-manager 的
// ComponentPreviewModal / SaveAsSharedBlockModal、data-model 的
// ImportModal 等）各自重複的「position: fixed + inset: 0 + 半透明
// 黑底 + 置中卡片 + 點外部關閉 + Esc 關閉」樣式抽出來的共用版本。
//
// 只負責「遮罩 + 卡片容器 + 關閉互動」，卡片內部內容（標題、表單、
// 按鈕列…）交給呼叫端用 children 自行組合，維持原本各自 modal 的彈性。
// ------------------------------------------------------------

export function ModalOverlay({
  onClose,
  children,
  maxWidth = 560,
  zIndex = 1000,
  closeOnEsc = true,
  closeOnBackdropClick = true,
  ariaLabel,
}: {
  /** 點遮罩背景或按 Esc 時呼叫；不傳則不會自動關閉（仍可用內容自帶的取消按鈕關閉）。 */
  onClose?: () => void;
  children: ReactNode;
  /** 卡片最大寬度（px）。 */
  maxWidth?: number;
  zIndex?: number;
  closeOnEsc?: boolean;
  closeOnBackdropClick?: boolean;
  /** dialog 的 aria-label，供螢幕閱讀器辨識這個 modal 的用途。 */
  ariaLabel?: string;
}) {
  useEffect(() => {
    if (!closeOnEsc || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeOnEsc, onClose]);

  const handleBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdropClick || !onClose) return;
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      style={{ ...overlayStyle, zIndex }}
      onMouseDown={handleBackdropMouseDown}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        style={{ ...cardStyle, maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/** Modal 卡片內的標題列（標題文字 + 右側可選的關閉鈕），維持跟原本各處一致的間距。 */
export function ModalHeader({
  title,
  onClose,
  extra,
}: {
  title: ReactNode;
  onClose?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div style={headerRowStyle}>
      <h3 style={headerTitleStyle}>{title}</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {extra}
        {onClose && (
          <button type="button" onClick={onClose} style={closeBtnStyle} title="關閉" aria-label="關閉">
            ×
          </button>
        )}
      </div>
    </div>
  );
}

/** Modal 底部按鈕列（靠右對齊），常見於「取消 / 確認」這類收尾動作。 */
export function ModalFooter({ children }: { children: ReactNode }) {
  return <div style={footerRowStyle}>{children}</div>;
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxHeight: "85vh",
  overflowY: "auto",
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 8,
  padding: 20,
  boxSizing: "border-box",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 14,
};

const headerTitleStyle: CSSProperties = {
  fontSize: 14,
  margin: 0,
  color: "#eee",
};

const closeBtnStyle: CSSProperties = {
  background: "transparent",
  color: "#999",
  border: "none",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
  padding: 2,
};

const footerRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 12,
};
