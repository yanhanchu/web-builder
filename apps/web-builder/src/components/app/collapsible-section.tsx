import { useState, type ReactNode } from 'react';
import { appStyles as styles } from '@/styles/styles';
import { cn } from '@workspace/ui/utils/utils';

/**
 * 單一可收合區塊，用於「App 設定」頁把 SEO / favicon / analytics 等
 * 較長的欄位群組拆開，預設收合、點擊標題展開/收合，避免整頁一次塞爆。
 */
export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={styles.collapsible}>
      <button
        type="button"
        className={styles.collapsibleTrigger}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.collapsibleTriggerLeft}>
          <svg
            className={cn(styles.collapsibleChevron, open && styles.collapsibleChevronOpen)}
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
          >
            <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {title}
        </span>
      </button>
      {open && (
        <div className={styles.collapsibleBody}>
          {description && <p className={styles.hint}>{description}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
