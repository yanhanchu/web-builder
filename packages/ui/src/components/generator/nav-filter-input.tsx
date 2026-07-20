import { Search, X } from 'lucide-react';
import { cn } from '@workspace/ui/utils/utils';

interface NavFilterInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}

/**
 * 側邊欄 Components / Functions 區塊共用的搜尋輸入框。
 * 純受控元件，過濾邏輯交給呼叫端（樹狀結構 vs 扁平清單的過濾方式不同）。
 */
export function NavFilterInput({ value, onChange, placeholder, className }: NavFilterInputProps) {
  return (
    <div className={cn('relative mb-1.5', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/50"
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-secondary/40 py-1.5 pr-7 pl-8 text-[0.8125rem] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground"
          aria-label="清除搜尋"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
