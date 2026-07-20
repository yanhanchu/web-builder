import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getFunctionById, getFunctionByIndex, getRelatedTypesForFunction } from '@workspace/ui/lib/generator/function-registry';
import { FunctionSignature } from '@workspace/ui/components/generator/function-signature';
import { ParamsTable } from '@workspace/ui/components/generator/params-table';
import { TypePill } from '@workspace/ui/components/generator/type-pill';
import { TypeCard } from '@workspace/ui/components/generator/type-card';
import { updateFunctionDescriptionRemote } from '@workspace/ui/lib/generator/write-back-functions-client';
import { tableStyles as t } from '@workspace/ui/styles/generator/table-styles';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function FunctionDetail() {
  const { id, index } = useParams<{ id: string; index: string }>();
  const doc = index !== undefined
    ? getFunctionByIndex(Number(index))
    : id
      ? getFunctionById(id)
      : undefined;

  // description 是可編輯狀態，其餘欄位（params/returns/throws...）目前唯讀，
  // 所以 state 只需要放在這一層，不用像 PropsTable 那樣拆到逐列的子元件。
  const [description, setDescription] = useState(doc?.description ?? '');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!doc) {
    return (
      <div className="max-w-[480px] pt-12">
        <p className="m-0 mb-2 font-mono font-bold text-destructive">404</p>
        <h1 className="m-0 mb-3 text-2xl">找不到這個函式</h1>
        <p className="leading-relaxed text-muted-foreground">
          它可能已被移除，或者你需要重新執行{' '}
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono">npm run functions:generate</code>。
        </p>
        <Link to="/functions" className="mt-6 inline-block text-[0.8125rem] text-muted-foreground/70 no-underline transition-colors duration-150 hover:text-primary">
          ← 回函式列表
        </Link>
      </div>
    );
  }

  const relatedTypes = getRelatedTypesForFunction(doc);
  const requiredParamCount = doc.params.filter((p) => !p.optional).length;
  const isDirty = description !== doc.description;

  async function handleSave() {
    if (!doc) return;
    setSaveState('saving');
    setError(null);

    const result = await updateFunctionDescriptionRemote({
      filePath: doc.filePath,
      functionName: doc.functionName,
      description,
    });

    if (result.ok) {
      setSaveState('saved');
      // functions.json 已由 middleware 重新產生；functions-registry.ts 是 build-time import，
      // 這裡簡單用整頁重新整理讓所有頁面（包含側邊欄、FunctionsHome 卡片）都吃到最新資料。
      window.setTimeout(() => window.location.reload(), 400);
    } else {
      setSaveState('error');
      setError(result.error ?? '寫回失敗');
    }
  }

  function handleReset() {
    setDescription(doc!.description);
    setSaveState('idle');
    setError(null);
  }

  return (
    <div className="max-w-[760px]">
      <Link to="/functions" className="mb-6 inline-block text-[0.8125rem] text-muted-foreground/70 no-underline transition-colors duration-150 hover:text-primary">
        ← 所有函式
      </Link>

      <header className="mb-10">
        <h1 className="m-0 mb-2.5 font-mono text-[2rem] font-extrabold tracking-tight">{doc.functionName}</h1>

        {doc.deprecated && (
          <div className="m-0 mb-4 flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-[0.8125rem] text-muted-foreground">
            <span className="rounded border border-destructive/40 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-destructive uppercase whitespace-nowrap">
              Deprecated
            </span>
            <span>{doc.deprecated}</span>
          </div>
        )}

        <div className="m-0 mb-4 flex max-w-[560px] flex-col gap-2">
          <textarea
            className={`${t.editTextarea} text-[0.9375rem]`}
            value={description}
            placeholder="（無說明）"
            rows={3}
            onChange={(e) => {
              setDescription(e.target.value);
              setSaveState('idle');
            }}
          />
          {isDirty && (
            <div className={t.editActions}>
              <button
                type="button"
                className={t.saveButton}
                disabled={saveState === 'saving'}
                onClick={handleSave}
              >
                {saveState === 'saving' ? '寫入中…' : '寫回 JSDoc'}
              </button>
              <button type="button" className={t.cancelButton} onClick={handleReset}>
                取消
              </button>
            </div>
          )}
          {saveState === 'saved' && <p className={t.saveHint}>✅ 已寫回，重新整理中…</p>}
          {saveState === 'error' && error && <p className={t.saveError}>⚠️ {error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground/70">
          <code className="rounded border border-border bg-secondary px-2 py-0.5 font-mono text-muted-foreground">{doc.filePath}</code>
          <span className="text-border">·</span>
          <span className="font-mono">
            {doc.params.length} param{doc.params.length === 1 ? '' : 's'}
          </span>
          {requiredParamCount > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="font-mono">{requiredParamCount} required</span>
            </>
          )}
          {doc.isAsync && (
            <>
              <span className="text-border">·</span>
              <span className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono font-bold text-primary">async</span>
            </>
          )}
        </div>
      </header>

      <section className="mb-10">
        <h2 className="m-0 mb-1.5 text-[0.8125rem] font-bold tracking-wider text-muted-foreground uppercase">Signature</h2>
        <FunctionSignature fn={doc} />
      </section>

      <section className="mb-10">
        <h2 className="m-0 mb-1.5 text-[0.8125rem] font-bold tracking-wider text-muted-foreground uppercase">Parameters</h2>
        <ParamsTable params={doc.params} />
      </section>

      <section className="mb-10">
        <h2 className="m-0 mb-1.5 text-[0.8125rem] font-bold tracking-wider text-muted-foreground uppercase">Returns</h2>
        <div className="rounded-xl border border-border bg-card p-[1rem_1.2rem]">
          <TypePill type={doc.returnType} />
          {doc.returnDescription && (
            <p className="m-0 mt-2.5 text-[0.8125rem] leading-relaxed text-muted-foreground">{doc.returnDescription}</p>
          )}
        </div>
      </section>

      {doc.throws.length > 0 && (
        <section className="mb-10">
          <h2 className="m-0 mb-1.5 text-[0.8125rem] font-bold tracking-wider text-muted-foreground uppercase">Throws</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {doc.throws.map((message, i) => (
              <li
                key={i}
                className="rounded-md border border-border border-l-[3px] border-l-destructive bg-card px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-muted-foreground"
              >
                {message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {relatedTypes.length > 0 && (
        <section className="mb-10">
          <h2 className="m-0 mb-1.5 text-[0.8125rem] font-bold tracking-wider text-muted-foreground uppercase">相關型別</h2>
          <p className="m-0 mb-4 text-[0.8125rem] leading-relaxed text-muted-foreground/70">
            這個函式的參數與回傳型別中，實際用到的 interface / type 定義。
          </p>
          {relatedTypes.map((type) => (
            <TypeCard key={type.name} type={type} />
          ))}
        </section>
      )}
    </div>
  );
}
