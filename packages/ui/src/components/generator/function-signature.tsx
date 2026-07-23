import type { FunctionDoc } from '@workspace/ui/types/generator/function-types';

/**
 * 純展示用：把 FunctionDoc 組回一行「看起來像程式碼」的簽章字串，
 * 例如：async function sendWelcomeEmail(recipient: EmailRecipient, locale?: string): Promise<boolean>
 * 只是視覺呈現，不是真的拿去 parse 或執行。
 */
export function FunctionSignature({ fn }: { fn: FunctionDoc }) {
  const paramsStr = fn.params
    .map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`)
    .join(', ');

  return (
    <pre className="m-0 overflow-x-auto rounded-xl border border-border bg-secondary p-[1rem_1.2rem] font-mono text-[0.8125rem] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
      <code>
        {fn.isAsync && <span className="text-muted-foreground/70">async </span>}
        <span className="text-muted-foreground/70">function </span>
        <span className="font-bold text-primary">{fn.functionName}</span>
        <span className="text-muted-foreground/70">(</span>
        {paramsStr}
        <span className="text-muted-foreground/70">)</span>
        <span className="text-muted-foreground/70">: </span>
        <span className="text-foreground">{fn.returnType}</span>
      </code>
    </pre>
  );
}
