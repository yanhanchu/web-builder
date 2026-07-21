import { cn } from '@workspace/ui/utils/utils';
import { VALUE_TYPES, type ValueType } from '@/utils/i18n-utils';

/**
 * 依 `ValueType` 決定要用哪種輸入元件的共用元件，讓「節點編輯器（page-editor）」
 * 跟未來的「i18n 管理頁（/i18n）」可以共用同一套「value type -> 輸入 UI」對應規則，
 * 不用各自刻一份重複的 switch。
 *
 * 目前只處理「字串類」的 value type（`string` 到 `markdown`，即 `STRING_LIKE_VALUE_TYPES`）——
 * `number` / `boolean` / `date` 在這裡的两個呼叫端都已經有各自既有的輸入方式
 * （page-editor 的 `boolean` select、`number` input；i18n 管理頁維持既有 UI），
 * 所以先不在此元件涵蓋，避免用一個元件硬吃兩種完全不同的資料型別。
 *
 * 對應規則：
 * - `string`      -> 單行 text input
 * - `multiline`   -> textarea
 * - `email`       -> input type="email"
 * - `url`         -> input type="url"
 * - `phone`       -> input type="tel"
 * - `color`       -> input type="color"（跟主題編輯器 `theme-generator.tsx` 同一種原生調色盤，
 *                    不额外引入套件）+ 旁邊一個文字 input 顯示/手動輸入色碼，
 *                    因為原生 `<input type="color">` 只接受合法 hex，使用者可能想輸入
 *                    css variable 或非 hex 色碼字串。
 * - `file`        -> 目前檔案管理走 `/files` 頁另一套流程，這裡先當純文字路徑輸入，
 *                    保留之後接上檔案選擇器的擴充點。
 * - `markdown`    -> 先用 textarea（如題目所述，markdown 之後才做專屬編輯器）。
 */
export const STRING_LIKE_VALUE_TYPES = [
  'string',
  'multiline',
  'email',
  'url',
  'phone',
  'color',
  'file',
  'markdown',
] as const satisfies readonly ValueType[];

export type StringLikeValueType = (typeof STRING_LIKE_VALUE_TYPES)[number];

export function isStringLikeValueType(type: string): type is StringLikeValueType {
  return (STRING_LIKE_VALUE_TYPES as readonly string[]).includes(type);
}

/** 一個 value type 選項旁要顯示的簡短圖示 + 標籤，供下拉選單使用。 */
export const VALUE_TYPE_META: Record<ValueType, { icon: string; label: string }> = {
  string: { icon: 'Aa', label: '一般文字' },
  multiline: { icon: '¶', label: '多行文字' },
  email: { icon: '@', label: 'Email' },
  url: { icon: '🔗', label: '連結 URL' },
  phone: { icon: '☎', label: '電話' },
  color: { icon: '🎨', label: '色碼' },
  file: { icon: '📎', label: '檔案路徑' },
  markdown: { icon: 'M↓', label: 'Markdown' },
  number: { icon: '#', label: '數字' },
  boolean: { icon: '⚑', label: '布林值' },
  date: { icon: '📅', label: '日期' },
};

/** `<select>` 的 value type 選單樣式，跟 page-editor 既有的 `styles.select` 外觀一致（呼叫端可覆寫 className）。 */
const defaultSelectClass =
  'rounded-md border border-border bg-secondary px-2 py-1.5 font-sans text-[0.8125rem] text-foreground outline-none focus:border-primary';
const defaultTextInputClass =
  'box-border w-full rounded-md border border-border bg-card px-2.5 py-2 font-mono text-sm font-normal tracking-normal text-foreground normal-case outline-none focus:border-primary';
const defaultTextareaClass =
  'box-border w-full resize-y rounded-md border border-border bg-card p-2.5 font-mono text-sm font-normal tracking-normal text-foreground normal-case outline-none focus:border-primary';
const defaultColorSwatchClass =
  'h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-card p-0.5';

/**
 * 「選擇 value type」的下拉選單，僅列出字串類型（`STRING_LIKE_VALUE_TYPES`），
 * 給呼叫端決定同一個字串 prop / i18n key 要用哪種輸入元件呈現。
 */
export function ValueTypeSelect({
  value,
  onChange,
  className,
}: {
  value: StringLikeValueType;
  onChange: (next: StringLikeValueType) => void;
  className?: string;
}) {
  return (
    <select
      className={cn(defaultSelectClass, className)}
      value={value}
      onChange={(e) => onChange(e.target.value as StringLikeValueType)}
      title="輸入類型（決定下方要用哪種輸入元件）"
    >
      {STRING_LIKE_VALUE_TYPES.map((t) => (
        <option key={t} value={t}>
          {VALUE_TYPE_META[t].icon} {VALUE_TYPE_META[t].label}
        </option>
      ))}
    </select>
  );
}

/**
 * 依 `valueType` 渲染對應的輸入元件本體（不含 value type 選單，選單由呼叫端另外放
 * `ValueTypeSelect`，因為兩者在不同呼叫端的排版位置不一定相同）。
 * `value`/`onChange` 一律是字串進、字串出，維持跟既有 `props[name]` / i18n value 相同的資料型別。
 */
export function ValueTypeField({
  valueType,
  value,
  onChange,
  disabled,
  placeholder,
  inputClassName,
  textareaClassName,
}: {
  valueType: StringLikeValueType;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
  textareaClassName?: string;
}) {
  switch (valueType) {
    case 'multiline':
    case 'markdown':
      return (
        <textarea
          className={cn(defaultTextareaClass, textareaClassName)}
          rows={valueType === 'markdown' ? 4 : 2}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'email':
      return (
        <input
          type="email"
          className={cn(defaultTextInputClass, inputClassName)}
          value={value}
          disabled={disabled}
          placeholder={placeholder ?? 'name@example.com'}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'url':
      return (
        <input
          type="url"
          className={cn(defaultTextInputClass, inputClassName)}
          value={value}
          disabled={disabled}
          placeholder={placeholder ?? 'https://example.com'}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'phone':
      return (
        <input
          type="tel"
          className={cn(defaultTextInputClass, inputClassName)}
          value={value}
          disabled={disabled}
          placeholder={placeholder ?? '+886 912 345 678'}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'color': {
      // 原生 <input type="color"> 只接受合法 6 碼 hex，value 若是 css 變數、
      // rgb()/oklch() 等非 hex 格式時，調色盤本身會忽略、退回黑色 —— 因此
      // 色票只在合法 hex 時才把值帶進去，另外用一個文字 input 讓使用者可以
      // 輸入或看到任意格式的原始字串，兩者互相同步。
      const isHex = /^#[0-9a-fA-F]{6}$/.test(value);
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            className={defaultColorSwatchClass}
            value={isHex ? value : '#000000'}
            disabled={disabled}
            title="用調色盤選色"
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            type="text"
            className={cn(defaultTextInputClass, 'flex-1', inputClassName)}
            value={value}
            disabled={disabled}
            placeholder={placeholder ?? '#22c55e / var(--primary) / oklch(...)'}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    }
    case 'file':
      return (
        <input
          type="text"
          className={cn(defaultTextInputClass, inputClassName)}
          value={value}
          disabled={disabled}
          placeholder={placeholder ?? '/files/example.png'}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'string':
    default:
      return (
        <input
          type="text"
          className={cn(defaultTextInputClass, inputClassName)}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export { VALUE_TYPES };
export type { ValueType };
