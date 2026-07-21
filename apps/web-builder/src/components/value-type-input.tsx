import { cn } from '@workspace/ui/utils/utils';
import { VALUE_TYPES, type ValueType } from '@/utils/i18n-utils';

/**
 * 依 `ValueType` 決定要用哪種輸入元件的共用元件，讓「節點編輯器（page-editor）」
 * 跟「i18n 管理頁（/i18n）」可以共用同一套「value type -> 輸入 UI」對應規則，
 * 不用各自刻一份重複的 switch。
 *
 * 涵蓋全部 `ValueType`（`string` 到 `date`）。`value`/`onChange` 一律維持字串
 * 進、字串出（因為底層資料——`props[name]` 跟 i18n 的 `FlatDict`——本身就只存
 * 字串），`number`/`boolean`/`date` 也不例外，只是渲染成原生的
 * number/checkbox（樣式做成開關）/date 輸入元件，內部再跟字串互轉：
 * - `number` 輸入的是空字串或合法數字字串，直接透傳（不強制轉型，避免
 *   使用者輸入到一半、還沒打完數字時被攔截）。
 * - `boolean` 用 `value === 'true'` 判斷開關狀態，切換時寫回 `'true'`/`'false'`
 *   字串。
 * - `date` 用原生 `<input type="date">`，其 value 格式本身就是 `yyyy-mm-dd`
 *   字串，跟儲存格式一致，不需要額外轉換。
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
 * - `number`      -> input type="number"
 * - `boolean`     -> 開關（樣式化的 checkbox，非原生外觀的方塊）
 * - `date`        -> input type="date"（原生日期選擇器）
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

/**
 * 依 `ValueType` 驗證一個字串值是否合法，給 i18n 管理頁在「存檔前」擋掉不合法
 * 的輸入（例如 email 打錯格式、number 打了非數字）。空字串一律視為合法——
 * 「尚未填寫」不該被當成格式錯誤擋住存檔，只有「有填但格式不對」才擋。
 * 跟 `ValueTypeField` 用同一份 switch 對應規則放在同一個檔案，值的「型別
 * 該長什麼樣子」定義只有一份，不會兩邊各自認定不同的規則。
 */
export function isValidValueForType(valueType: ValueType, value: string): boolean {
  if (value === '') return true;
  switch (valueType) {
    case 'email':
      // 簡單驗證：非空字串 + 至少一個 @ 隔開的兩段，不追求 RFC 完整規則。
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'url':
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    case 'phone':
      // 寬鬆驗證：允許數字、空白、+ - ( )，至少 6 碼數字，避免擋掉各國不同格式。
      return /^[+()\d\s-]{6,}$/.test(value) && /\d{6,}/.test(value.replace(/\D/g, ''));
    case 'color':
      // 允許 hex、css 變數（var(--xxx)）、或 rgb()/oklch() 等函式式色碼，
      // 不強制只能是 hex（ValueTypeField 本身也允許非 hex 的原始字串）。
      return (
        /^#[0-9a-fA-F]{3,8}$/.test(value) ||
        /^var\(--[\w-]+\)$/.test(value) ||
        /^[a-z-]+\([^)]*\)$/i.test(value)
      );
    case 'number':
      return /^-?\d+(\.\d+)?$/.test(value);
    case 'boolean':
      return value === 'true' || value === 'false';
    case 'date':
      // 原生 <input type="date"> 的 value 格式固定是 yyyy-mm-dd；同時檢查
      // 真的是合法日曆日期（例如 2024-02-30 格式對但日期不存在）。
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const d = new Date(value);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
    case 'file':
      // 純文字路徑，目前沒有額外規則（檔案是否存在留給 /files 頁處理）。
      return true;
    case 'string':
    case 'multiline':
    case 'markdown':
    default:
      // 一般文字/多行/markdown 沒有格式限制，任何字串都合法。
      return true;
  }
}

/** 依 `ValueType` 回傳簡短的驗證失敗說明文字，供輸入框旁的錯誤訊息使用。 */
export function valueTypeErrorMessage(valueType: ValueType): string {
  switch (valueType) {
    case 'email':
      return '不是合法的 email 格式，例如 name@example.com';
    case 'url':
      return '不是合法的網址，需包含 http(s):// 等協定';
    case 'phone':
      return '不是合法的電話號碼';
    case 'color':
      return '不是合法的色碼（hex、var(--xxx) 或 rgb()/oklch() 等函式式色碼）';
    case 'number':
      return '不是合法的數字';
    case 'boolean':
      return '布林值必須是 true 或 false';
    case 'date':
      return '不是合法的日期（需為 yyyy-mm-dd 且是實際存在的日期）';
    default:
      return '格式不正確';
  }
}
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
const defaultSwitchTrackClass =
  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors duration-150 outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60';
const defaultSwitchThumbClass =
  'inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform duration-150';

/**
 * 「選擇 value type」的下拉選單，列出全部 `VALUE_TYPES`，給呼叫端決定同一個
 * 字串 prop / i18n key 要用哪種輸入元件呈現（包含 `number`/`boolean`/`date`）。
 * 呼叫端底層欄位若只接受 `StringLikeValueType`（例如 page-editor.tsx 的
 * `node.valueType`/`node.propValueTypes`），請改用下面的
 * `StringLikeValueTypeSelect`，避免這裡選出 `number`/`boolean`/`date`
 * 卻塞不進那些欄位的型別。
 */
export function ValueTypeSelect({
  value,
  onChange,
  className,
}: {
  value: ValueType;
  onChange: (next: ValueType) => void;
  className?: string;
}) {
  return (
    <select
      className={cn(defaultSelectClass, className)}
      value={value}
      onChange={(e) => onChange(e.target.value as ValueType)}
      title="輸入類型（決定下方要用哪種輸入元件）"
    >
      {VALUE_TYPES.map((t) => (
        <option key={t} value={t}>
          {VALUE_TYPE_META[t].icon} {VALUE_TYPE_META[t].label}
        </option>
      ))}
    </select>
  );
}

/**
 * `ValueTypeSelect` 的窄化版本：只列出 `STRING_LIKE_VALUE_TYPES`，`onChange`
 * 回傳型別也收斂成 `StringLikeValueType`。給 page-editor.tsx 這類「底層欄位
 * 本來就只允許字串類型」的呼叫端使用（`node.valueType`、
 * `node.propValueTypes[name]` 目前的設計就是不支援 number/boolean/date，
 * 這些型別只在 i18n 管理頁的 key 型別標記中才有意義）。
 */
export function StringLikeValueTypeSelect({
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
  valueType: ValueType;
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
    case 'number':
      // value 維持字串（跟其他 case 一致，底層資料本身只存字串），這裡只是
      // 換成 type="number" 的輸入元件，讓使用者能用數字鍵盤／上下箭頭調整；
      // 允許空字串（尚未填寫）跟使用者輸入到一半的中繼狀態，不強制轉型或
      // 四捨五入，onChange 原樣把 e.target.value 傳出去。
      return (
        <input
          type="number"
          className={cn(defaultTextInputClass, inputClassName)}
          value={value}
          disabled={disabled}
          placeholder={placeholder ?? '0'}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'date':
      // 原生 <input type="date">，value/onChange 格式本身就是 "yyyy-mm-dd"
      // 字串，跟儲存格式（純字串）一致，不需要額外轉換或引入日期套件。
      return (
        <input
          type="date"
          className={cn(defaultTextInputClass, inputClassName)}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'boolean': {
      // 開關樣式（非原生方塊 checkbox 外觀），底層仍是 checkbox 以維持鍵盤/
      // 無障礙操作方式；value 是 "true"/"false" 字串（沿用既有純字串儲存
      // 格式），checked 狀態單純判斷 value === 'true'。
      const checked = value === 'true';
      return (
        <label
          className="inline-flex cursor-pointer items-center gap-2"
          title={checked ? 'true' : 'false'}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
          />
          <span
            className={defaultSwitchTrackClass}
            style={{ backgroundColor: checked ? 'var(--primary)' : 'var(--secondary)' }}
          >
            <span
              className={defaultSwitchThumbClass}
              style={{ transform: checked ? 'translateX(1.375rem)' : 'translateX(0.125rem)' }}
            />
          </span>
          <span className="text-xs text-muted-foreground">{checked ? 'true' : 'false'}</span>
        </label>
      );
    }
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