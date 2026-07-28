// ============================================================
// render-block-tree —— 把 PageBlock 樹遞迴 render 成 React element 樹
//
// 這是「資料 + 組件 -> 畫面」這件事唯一的核心邏輯，從 apps/web-builder
// canvas-panel.tsx 的 CanvasBlockRenderer 抽出，拿掉了編輯器專屬的東西：
//   - 拖曳 / 放置（onDragOver、onDrop、hoverTarget…）
//   - 選取高亮（selectedBlockId、outline…）
//   - 畫布專屬的錯誤卡片 UI（BlockErrorBoundary 的紅框樣式）
//
// 保留的核心行為（跟 canvas-panel 完全一致，兩處共用同一份邏輯）：
//   - 用 componentRegistry 找出 ComponentDoc，用 loadComponent 動態載入模組
//   - 用 resolvePlainProps 把 plainProps 解析成純值
//   - 用 splitSlotProps 拆出 slotProps，遞迴 render 子 block 陣列成 ReactNode
//   - 找不到組件 / 載入失敗 / 渲染拋錯，都不能讓整棵樹掛掉，只讓那個節點
//     顯示成一個可替換的 fallback（畫布可以在外面再包一層更豐富的 UI，
//     這裡只保證「有 fallback」這個防呆本身）
//
// 提供兩種進入點：
//   - renderBlockTreeSync：組件模組必須「已經載入好」，同步遞迴出 ReactNode[]。
//     給靜態產生器（Node 端 renderToStaticMarkup 前，先用 loadAllComponentModules
//     預先載入完畢）與畫布共用。
//   - RenderBlockTree（React 元件）：內部處理 async loadComponent，
//     可以直接用在瀏覽器端（例如畫布），不需要呼叫端自己管理 loading state。
// ============================================================

import { Fragment, useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { DataStore } from "@workspace/ui/lib/data-model/schema";
import { componentPropsRegistry } from "@workspace/ui/lib/data-model/from-generated";
import {
  allComponents,
  getComponentById,
  loadComponentModule,
} from "@workspace/ui/lib/generator/component-registry";
import type { ComponentDoc } from "@workspace/ui/types/generator/component-types";
import { splitSlotProps, type PageBlock } from "@workspace/ui/lib/page-model";
import { resolvePlainProps } from "./resolve-props";

export interface RenderBlockTreeOptions {
  /** resolveValue 解析 i18n 綁定時要用的 locale。 */
  locale: string;
  /** 資料來源查表（通常是 InMemoryDataStore(sources, typeRegistry)）。 */
  store: DataStore;
  /**
   * 找不到組件定義、或組件模組載入失敗、或組件渲染拋錯時的替代畫面。
   * 不提供時使用預設的最小 fallback（一段純文字，不含樣式）。
   * 呼叫端（例如畫布）可以傳入更豐富的 UI（紅框卡片、移除按鈕等）。
   */
  renderFallback?: (info: BlockFallbackInfo) => ReactNode;
}

export type BlockFallbackReason =
  | { kind: "component-not-found" }
  | { kind: "load-error"; message: string }
  | { kind: "render-error"; message: string };

export interface BlockFallbackInfo {
  block: PageBlock;
  reason: BlockFallbackReason;
}

function defaultRenderFallback({ block, reason }: BlockFallbackInfo): ReactNode {
  const label =
    reason.kind === "component-not-found"
      ? `找不到組件定義（${block.componentId}）`
      : reason.kind === "load-error"
        ? `${block.componentName} 載入失敗：${reason.message}`
        : `${block.componentName} 渲染失敗：${reason.message}`;
  return <div data-block-fallback={block.instanceId}>{label}</div>;
}

/**
 * 把一個 block 的 props（plain + slot）解析成可以直接傳給真正組件的完整 props。
 * slot props 遞迴呼叫 renderBlockTreeSync，組成 ReactNode 陣列（用 Fragment 包裹，
 * 保留每個子節點的 key）。
 */
function resolveFullProps(
  block: PageBlock,
  options: RenderBlockTreeOptions,
): Record<string, unknown> {
  const { plainProps, slotProps } = splitSlotProps(block);
  const component = getComponentById(block.componentId);
  const propsFieldType = component ? componentPropsRegistry[component.id]?.propsType : undefined;

  const resolvedProps = resolvePlainProps(plainProps, propsFieldType, options.store, options.locale);

  for (const [key, children] of Object.entries(slotProps)) {
    resolvedProps[key] =
      children.length === 0 ? null : (
        <>
          {children.map((child) => (
            <Fragment key={child.instanceId}>{renderBlockTreeSync(child, options)}</Fragment>
          ))}
        </>
      );
  }

  return resolvedProps;
}

/**
 * 同步版：假設所有用到的組件模組都「已經載入完成」（見 preloadBlockTreeComponents），
 * 直接遞迴組出 ReactNode。適合：
 *   - 靜態產生器（Node 端，render 前先 preload 完畢，之後整棵樹同步 render）
 *   - 任何已經拿到 Component 實例、不需要 async 的呼叫端
 *
 * 找不到組件 / 沒有預先載入 / 渲染拋錯，都會走 fallback，不會拋出讓呼叫端中斷。
 */
export function renderBlockTreeSync(
  block: PageBlock,
  options: RenderBlockTreeOptions,
): ReactNode {
  const component = getComponentById(block.componentId);
  const renderFallback = options.renderFallback ?? defaultRenderFallback;

  if (!component) {
    return renderFallback({ block, reason: { kind: "component-not-found" } });
  }

  const cached = getCachedModule(component.importPath);
  if (!cached || cached.status === "pending") {
    return renderFallback({
      block,
      reason: { kind: "load-error", message: "組件模組尚未載入（請先呼叫 preloadBlockTreeComponents）" },
    });
  }
  if (cached.status === "error") {
    return renderFallback({ block, reason: { kind: "load-error", message: cached.message } });
  }

  const Component = cached.module[component.componentName] as ComponentType<Record<string, unknown>> | undefined;
  if (!Component) {
    return renderFallback({
      block,
      reason: { kind: "load-error", message: `找不到具名 export "${component.componentName}"` },
    });
  }

  const resolvedProps = resolveFullProps(block, options);

  try {
    return <Component {...resolvedProps} />;
  } catch (err) {
    return renderFallback({
      block,
      reason: { kind: "render-error", message: err instanceof Error ? err.message : String(err) },
    });
  }
}

export function renderBlockListSync(blocks: PageBlock[], options: RenderBlockTreeOptions): ReactNode {
  return (
    <>
      {blocks.map((block) => (
        <Fragment key={block.instanceId}>{renderBlockTreeSync(block, options)}</Fragment>
      ))}
    </>
  );
}

// ------------------------------------------------------------
// 模組快取（給同步渲染用）+ 遞迴收集整棵樹用到的 importPath + 預先載入
// ------------------------------------------------------------

type ModuleCacheEntry =
  | { status: "pending" }
  | { status: "ready"; module: Record<string, unknown> }
  | { status: "error"; message: string };

const syncModuleCache = new Map<string, ModuleCacheEntry>();

function getCachedModule(importPath: string): ModuleCacheEntry | undefined {
  return syncModuleCache.get(importPath);
}

/** 遞迴收集一整棵 blocks 樹（含巢狀 slot）用到的所有 componentId。 */
function collectComponentIds(blocks: PageBlock[], acc: Set<string> = new Set()): Set<string> {
  for (const block of blocks) {
    acc.add(block.componentId);
    const { slotProps } = splitSlotProps(block);
    for (const children of Object.values(slotProps)) {
      collectComponentIds(children, acc);
    }
  }
  return acc;
}

/**
 * 靜態產生器（或任何要用 renderBlockTreeSync 的呼叫端）在 render 前，
 * 必須先呼叫這個函式，把整棵樹會用到的組件模組全部載入進 syncModuleCache。
 *
 * 這個函式本身是 idempotent、可重複呼叫（例如多個頁面共用同一批組件時，
 * 已經快取過的 importPath 不會重複 import）。
 */
export async function preloadBlockTreeComponents(blocks: PageBlock[]): Promise<void> {
  const componentIds = collectComponentIds(blocks);
  const importPaths = new Set<string>();
  for (const id of componentIds) {
    const doc = getComponentById(id);
    if (doc) importPaths.add(doc.importPath);
  }

  await Promise.all(
    Array.from(importPaths).map(async (importPath) => {
      if (syncModuleCache.has(importPath)) return;
      syncModuleCache.set(importPath, { status: "pending" });
      try {
        const mod = await loadComponentModule(importPath);
        syncModuleCache.set(importPath, { status: "ready", module: mod });
      } catch (err) {
        syncModuleCache.set(importPath, {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}

/** 清空同步渲染用的模組快取（測試或熱重載場景使用）。 */
export function clearBlockTreeModuleCache(): void {
  syncModuleCache.clear();
}

// ------------------------------------------------------------
// React 元件版本：內部處理 async 載入，適合直接用在瀏覽器端（例如畫布）
// 呼叫端不需要自己管理 loading/error state，也不需要事先呼叫 preload。
// ------------------------------------------------------------

type AsyncLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; Component: ComponentType<Record<string, unknown>> };

export interface RenderBlockTreeProps extends RenderBlockTreeOptions {
  block: PageBlock;
  /** 載入中要顯示的內容（不提供則不顯示任何東西）。 */
  renderLoading?: (block: PageBlock) => ReactNode;
}

/**
 * 依 ComponentDoc 的 importPath async 載入模組，回傳目前的載入狀態。
 * 這是「動態載入組件模組」這件事唯一的 React 版邏輯，RenderBlockTree（下方）
 * 跟畫布（canvas-panel.tsx，需要保留自己的 loading/error UI 樣式，因此不能
 * 直接套用 RenderBlockTree 的預設外觀）都呼叫這顆 hook，不是各自維護一份
 * useState + useEffect + cancelled flag 的載入邏輯。
 */
export function useComponentModule(
  component: ComponentDoc | undefined,
): AsyncLoadState {
  const [state, setState] = useState<AsyncLoadState>({ status: "loading" });

  useEffect(() => {
    if (!component) return;
    let cancelled = false;
    setState({ status: "loading" });

    loadComponentModule(component.importPath)
      .then((mod) => {
        if (cancelled) return;
        const Component = mod[component.componentName] as
          | ComponentType<Record<string, unknown>>
          | undefined;
        if (!Component) {
          setState({ status: "error", message: `找不到具名 export "${component.componentName}"` });
          return;
        }
        setState({ status: "ready", Component });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [component]);

  return state;
}

/**
 * 單一 block 的 React 元件版本：自己管理 async 載入 component 模組的狀態。
 * 適合不需要編輯器專屬 UI（拖曳/選取/hover/InsertionLine）的呼叫端直接使用，
 * 例如未來的預覽頁、或不需要客製 loading/error 外觀的場景。
 *
 * 畫布（canvas-panel.tsx）因為需要在 slot 子節點之間插入 InsertionLine、
 * 且 loading/error 要用自己的樣式，並不直接用這個元件，而是改用
 * useComponentModule + resolvePlainProps 這兩顆更細粒度的共用邏輯自行組裝。
 */
export function RenderBlockTree({ block, renderLoading, ...options }: RenderBlockTreeProps) {
  const component = getComponentById(block.componentId);
  const renderFallback = options.renderFallback ?? defaultRenderFallback;
  const state = useComponentModule(component);

  if (!component) {
    return <>{renderFallback({ block, reason: { kind: "component-not-found" } })}</>;
  }
  if (state.status === "loading") {
    return <>{renderLoading?.(block) ?? null}</>;
  }
  if (state.status === "error") {
    return <>{renderFallback({ block, reason: { kind: "load-error", message: state.message } })}</>;
  }

  const { Component } = state;
  const resolvedProps = resolveFullPropsWithAsyncSlots(block, options, renderLoading);

  return <Component {...resolvedProps} />;
}

/**
 * RenderBlockTree（React 元件版）用的 props 解析：slot 底下的子節點也遞迴用
 * <RenderBlockTree> 元件渲染（而不是 renderBlockTreeSync），這樣巢狀組件
 * 各自獨立管理自己的 async 載入狀態，跟畫布原本行為一致。
 */
function resolveFullPropsWithAsyncSlots(
  block: PageBlock,
  options: RenderBlockTreeOptions,
  renderLoading?: (block: PageBlock) => ReactNode,
): Record<string, unknown> {
  const { plainProps, slotProps } = splitSlotProps(block);
  const component = getComponentById(block.componentId);
  const propsFieldType = component ? componentPropsRegistry[component.id]?.propsType : undefined;

  const resolvedProps = resolvePlainProps(plainProps, propsFieldType, options.store, options.locale);

  for (const [key, children] of Object.entries(slotProps)) {
    resolvedProps[key] =
      children.length === 0 ? null : (
        <>
          {children.map((child) => (
            <RenderBlockTree key={child.instanceId} block={child} renderLoading={renderLoading} {...options} />
          ))}
        </>
      );
  }

  return resolvedProps;
}

export { allComponents };
export type { ComponentDoc, PageBlock };
