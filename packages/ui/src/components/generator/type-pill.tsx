import { cn } from '@workspace/ui/utils/utils';

function splitUnion(type: string): string[] | null {
  // 只有看起來像純字面量 union（"a" | "b" | "c"）時才拆開顯示成多個 pill，
  // 其他型別（ReactNode、函式簽名、泛型...）維持單一 pill 呈現原始字串。
  if (!type.includes('|')) return null;
  const parts = type.split('|').map((p) => p.trim());
  const allLiterals = parts.every((p) => /^".*"$/.test(p));
  return allLiterals ? parts.map((p) => p.slice(1, -1)) : null;
}

const pillBaseClass = 'inline-block rounded-md px-2 py-0.5 font-mono text-xs leading-snug whitespace-nowrap';

export function TypePill({ type }: { type: string }) {
  const literals = splitUnion(type);

  if (literals) {
    return (
      <span className="inline-flex flex-wrap gap-1.5">
        {literals.map((lit) => (
          <code
            key={lit}
            data-kind="literal"
            className={cn(pillBaseClass, 'border border-info/25 bg-info/10 text-info')}
          >
            {lit}
          </code>
        ))}
      </span>
    );
  }

  return (
    <code data-kind="type" className={cn(pillBaseClass, 'border border-border bg-secondary text-muted-foreground')}>
      {type}
    </code>
  );
}
