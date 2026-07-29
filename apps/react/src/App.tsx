import { useState } from "react";
// 引用 workspace 共用 UI 套件（@workspace/ui），實際要用哪個元件視需求再展開。
// 例如：import { Button } from "@workspace/ui/components/demo/button";
import { cn } from "@workspace/ui/utils";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Vite + React + TypeScript</h1>
      <p className="text-muted-foreground text-sm">
        已接上 <code>@workspace/ui</code>（樣式 / utils），按了{" "}
        <span className={cn("font-medium text-foreground")}>{count}</span> 次。
      </p>
      <button
        type="button"
        className="rounded-md border px-4 py-2 text-sm"
        onClick={() => setCount((c) => c + 1)}
      >
        加一
      </button>
    </div>
  );
}
