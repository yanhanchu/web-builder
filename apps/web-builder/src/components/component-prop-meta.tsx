/**
 * 顯示「組件 prop 的中繼資料」（是否必填、預設值）的小徽章，專屬於節點編輯器裡
 * 「component 節點的 props」這個情境。
 *
 * 刻意獨立成自己的檔案、不放進 `@/components/value-type-input.tsx`：後者是
 * `ValueType`（string/multiline/email/…）輸入元件，之後 `/i18n` 管理頁的
 * key/value 編輯也會重用；但 i18n 的 key 沒有「required」「defaultValue」這種
 * 來自 TS prop 型別定義的概念（那是 `PropDoc` 專屬的欄位，見
 * `@workspace/ui/types/generator/component-types.ts`），硬塞進同一個共用元件
 * 只會讓 i18n 那邊也要處理用不到的 props。兩者維持各自獨立、互不依賴。
 */
export function PropMetaBadges({
  required,
  defaultValue,
}: {
  required: boolean;
  defaultValue: string | null;
}) {
  if (!required && !defaultValue) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {required && (
        <span
          className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold text-destructive"
          title="此 prop 為必填"
        >
          必填
        </span>
      )}
      {defaultValue && (
        <span
          className="inline-flex max-w-[160px] items-center truncate rounded-full border border-border bg-secondary px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground"
          title={`預設值：${defaultValue}`}
        >
          預設 {defaultValue}
        </span>
      )}
    </span>
  );
}