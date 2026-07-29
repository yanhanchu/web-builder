import { useState } from "react";
// 引用 workspace 共用 UI 套件（@workspace/ui）的 utils，示範 React island 可以
// 直接使用 monorepo 內的共用元件 / 樣式，例如：
//   import { Button } from "@workspace/ui/components/landing1/button";
import { cn } from "@workspace/ui/utils";

export function ReactCounter({ start = 0 }: { start?: number }) {
  const [count, setCount] = useState(start);

  return (
    <div className={cn("flex items-center gap-3")}>
      <button type="button" onClick={() => setCount((c) => c - 1)}>
        -
      </button>
      <span>{count}</span>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        +
      </button>
    </div>
  );
}
