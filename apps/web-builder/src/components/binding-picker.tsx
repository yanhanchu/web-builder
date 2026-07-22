// 通用綁定小視窗：點開即顯示，選 kind（i18n / dataRecord / 之後的 route/file）
// 再選候選項，只做「輸入限制 + 呈現 + 選擇後 emit」，完全不認識 pages/data-manager
// 等業務概念，也不直接碰任何 store —— 候選項一律透過 `listCandidates`
// （@/lib/binding-registry）取得，呼叫端只需要告訴它「這個 target 允許哪些
// kind、期待什麼型別」。
//
// 未來要擴充新的 BindingKind，只需要：
//   1. binding-types.ts 的 BindingKind 加一個字串
//   2. binding-registry.ts 的 listCandidates 加一個查詢分支
//   3. 這裡的 KIND_LABEL 加一個顯示名稱
// 小視窗本體完全不用改。

import { useMemo, useRef, useState } from "react";
import { cn } from "@workspace/ui/utils/utils";
import {
  type Binding,
  type BindingKind,
  type BindableValueType,
} from "@/types/binding-types";
import { listCandidates, type BindingCandidate } from "@/lib/binding-registry";
import type { ParsedField } from "@/types/data-manager-types";

const KIND_LABEL: Record<BindingKind, string> = {
  i18n: "i18n",
  dataRecord: "資料",
};

export interface BindingPickerProps {
  /** 目前這個欄位已經綁定的值（沒有綁定則為 undefined）。 */
  current: Binding | undefined;
  /** 這個 target 允許綁定哪幾種 kind（呼叫端決定，例如巢狀物件 target 可傳空陣列代表完全不可綁）。 */
  availableKinds: BindingKind[];
  /** 這個 target 期待的值型別，用來過濾候選項；不提供則不過濾。 */
  targetType?: BindableValueType;
  /** 目前的 app，查詢候選項要用。 */
  app: string;
  /** 只有 availableKinds 含 'dataRecord' 時才需要：這個 target 關聯到的 typeId 清單。 */
  dataRecordTypeIds?: { typeId: string; typeName: string; fields: ParsedField[] }[];
  /** 選擇完成（或取消綁定）時呼叫。 */
  onChange: (binding: Binding | null) => void;
}

/** 通用綁定小視窗：只做 input 和 emit。 */
export function BindingPicker({
  current,
  availableKinds,
  targetType,
  app,
  dataRecordTypeIds,
  onChange,
}: BindingPickerProps) {
  const [activeKind, setActiveKind] = useState<BindingKind | null>(
    current?.kind ?? availableKinds[0] ?? null,
  );
  const [filter, setFilter] = useState("");
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const candidates: BindingCandidate[] = useMemo(() => {
    if (!activeKind) return [];
    return listCandidates(activeKind, app, targetType, dataRecordTypeIds);
  }, [activeKind, app, targetType, dataRecordTypeIds]);

  const filteredCandidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.label.toLowerCase().includes(q));
  }, [candidates, filter]);

  function choose(refKey: string | undefined) {
    if (!refKey || !activeKind) {
      onChange(null);
    } else {
      onChange({ kind: activeKind, path: current?.path ?? "", refKey });
    }
    setFilter("");
    if (detailsRef.current) detailsRef.current.open = false;
  }

  if (availableKinds.length === 0) return null;

  return (
    <details
      ref={detailsRef}
      className="group relative w-9 shrink-0"
      onToggle={(e) => {
        const el = e.currentTarget;
        if (el.open) {
          requestAnimationFrame(() => {
            el.querySelector<HTMLInputElement>("input[data-binding-filter]")?.focus();
          });
        } else {
          setFilter("");
        }
      }}
    >
      <summary
        className={cn(
          "flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-border px-0 [&::-webkit-details-marker]:hidden",
          current ? "border-primary/40 text-primary" : "text-muted-foreground",
        )}
        title={
          current
            ? `已綁定 ${KIND_LABEL[current.kind]}「${current.refKey}」（點擊變更或解除）`
            : "綁定欄位（顯示時動態換值）"
        }
      >
        🔗
      </summary>

      <div className="absolute right-0 z-10 mt-1 w-[280px] rounded-md border border-border bg-card p-2 shadow-lg">
        {availableKinds.length > 1 && (
          <div className="mb-2 flex gap-1">
            {availableKinds.map((k) => (
              <button
                key={k}
                type="button"
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  k === activeKind
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary",
                )}
                onClick={() => setActiveKind(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
        <input
          data-binding-filter
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="篩選…"
          className="mb-2 w-full rounded border border-border bg-background px-2 py-1 text-xs normal-case"
        />
        <div className="max-h-[240px] overflow-y-auto">
          <button
            type="button"
            className="block w-full cursor-pointer rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-secondary"
            onClick={() => choose(undefined)}
          >
            不綁定
          </button>

          {filteredCandidates.length === 0 && (
            <p className="px-2 py-1.5 text-[0.75rem] text-muted-foreground/70 italic">
              （找不到符合的項目）
            </p>
          )}

          {filteredCandidates.map((c) => (
            <button
              key={c.refKey}
              type="button"
              className={cn(
                "block w-full cursor-pointer rounded px-2 py-1.5 text-left text-xs hover:bg-secondary",
                current?.kind === activeKind && c.refKey === current?.refKey
                  ? "bg-primary/10 text-primary"
                  : "text-foreground",
              )}
              onClick={() => choose(c.refKey)}
            >
              <div className="truncate font-mono">{c.refKey}</div>
              <div className="truncate text-[0.6875rem] text-muted-foreground/70">
                {c.label}
              </div>
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}
