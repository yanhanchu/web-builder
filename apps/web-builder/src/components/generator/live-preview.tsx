import { useEffect, useState } from 'react';
import { loadComponentModule } from '@/lib/generator/component-registry';

interface LivePreviewProps {
  importPath: string;
  componentName: string;
  /** 用來實際渲染示範的 props（每個組件不同，由呼叫端提供） */
  demoProps: Record<string, unknown>;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; Component: React.ComponentType<Record<string, unknown>> };

/**
 * 依 importPath 動態 import 組件模組本體，然後用 demoProps 渲染出來。
 * 這示範了「解析出來的 metadata（props/型別）」與「組件實際程式碼」
 * 是分離的兩件事：metadata 是 build-time 靜態資料，
 * 組件本體則是 runtime 才透過 code-splitting 載入的 chunk。
 */
export function LivePreview({ importPath, componentName, demoProps }: LivePreviewProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    loadComponentModule(importPath)
      .then((mod) => {
        if (cancelled) return;
        const Component = mod[componentName] as React.ComponentType<Record<string, unknown>> | undefined;
        if (!Component) {
          setState({
            status: 'error',
            message: `模組中找不到具名 export "${componentName}"`,
          });
          return;
        }
        setState({ status: 'ready', Component });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: 'error', message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [importPath, componentName]);

  return (
    <div
      // 固定用深色棋盤格背景（不依賴 --card / --secondary 等可能是淺色主題的
      // CSS 變數），避免淺色主題下背景太白、蓋掉本身文字也是深色的組件，
      // 讓預覽在任何主題設定下都維持可辨識的對比度。
      className="flex min-h-[140px] items-center justify-center rounded-xl border border-[#333] bg-[image:repeating-linear-gradient(45deg,#242424,#242424_1px,#141414_1px,#141414_10px)] p-10"
    >
      {state.status === 'loading' && <div className="font-mono text-[0.8125rem] text-[#888]">載入組件中…</div>}
      {state.status === 'error' && <div className="text-center font-mono text-[0.8125rem] text-[#e77]">⚠ {state.message}</div>}
      {state.status === 'ready' && <state.Component {...demoProps} />}
    </div>
  );
}
