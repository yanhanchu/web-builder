import { Link, useParams } from 'react-router-dom';
import { getComponentById, getComponentByIndex } from '@workspace/ui/lib/generator/component-registry';
import { demoPropsById } from '@workspace/ui/content/generator/demo-props';
import { LivePreview } from '@workspace/ui/components/generator/live-preview';
import { PropsTable } from '@workspace/ui/components/generator/props-table';

export function ComponentDetail() {
  const { id, index } = useParams<{ id: string; index: string }>();
  const doc = index !== undefined
    ? getComponentByIndex(Number(index))
    : id
      ? getComponentById(id)
      : undefined;

  if (!doc) {
    return (
      <div className="max-w-[480px] pt-12">
        <p className="m-0 mb-2 font-mono font-bold text-destructive">404</p>
        <h1 className="m-0 mb-3 text-2xl">找不到這個組件</h1>
        <p className="leading-relaxed text-muted-foreground">
          它可能已被移除，或者你需要重新執行{' '}
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono">npm run docs:generate</code>。
        </p>
        <Link to="/" className="mt-6 inline-block text-[0.8125rem] text-muted-foreground/70 no-underline transition-colors duration-150 hover:text-primary">
          ← 回組件列表
        </Link>
      </div>
    );
  }

  const requiredCount = doc.props.filter((p) => p.required).length;
  const demoProps = demoPropsById[doc.id] ?? {};

  return (
    <div className="max-w-[760px]">
      <Link to="/" className="mb-6 inline-block text-[0.8125rem] text-muted-foreground/70 no-underline transition-colors duration-150 hover:text-primary">
        ← 所有組件
      </Link>

      <header className="mb-10">
        <h1 className="m-0 mb-2.5 text-[2rem] font-extrabold tracking-tight">{doc.componentName}</h1>
        {doc.description && (
          <p className="m-0 mb-4 max-w-[560px] text-[0.9375rem] leading-relaxed whitespace-pre-line text-muted-foreground">
            {doc.description}
          </p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
          <code className="rounded border border-border bg-secondary px-2 py-0.5 font-mono text-muted-foreground">{doc.filePath}</code>
          <span className="text-border">·</span>
          <span className="font-mono">{doc.props.length} props</span>
          {requiredCount > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="font-mono">{requiredCount} required</span>
            </>
          )}
        </div>
      </header>

      <section className="mb-10">
        <h2 className="m-0 mb-1.5 text-[0.8125rem] font-bold tracking-wider text-muted-foreground uppercase">Live Preview</h2>
        <p className="m-0 mb-4 text-[0.8125rem] leading-relaxed text-muted-foreground/70">
          組件本體透過 <code className="font-mono text-muted-foreground">import()</code> 動態載入，非首屏必要程式碼不會拖慢列表頁。
        </p>
        <LivePreview
          importPath={doc.importPath}
          componentName={doc.componentName}
          demoProps={demoProps}
        />
      </section>

      <section className="mb-10">
        <h2 className="m-0 mb-1.5 text-[0.8125rem] font-bold tracking-wider text-muted-foreground uppercase">Props</h2>
        <PropsTable props={doc.props} filePath={doc.filePath} componentName={doc.componentName} />
      </section>
    </div>
  );
}
