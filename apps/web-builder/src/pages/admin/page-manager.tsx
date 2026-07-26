import { useMemo, useState } from "react";
import {
  Plus,
  Save,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
  ArrowUp,
  ArrowDown,
  X,
  GripVertical,
} from "lucide-react";
import {
  AdminLayout,
  useSavedFlash,
  panelStyle,
  panelTitleStyle,
  labelStyle,
  fieldRowStyle,
  inputStyle,
  textareaStyle,
  primaryBtnStyle,
  ghostBtnStyle,
  dangerBtnStyle,
  savedFlashStyle,
} from "./admin-ui";
import { defaultSeo, type SeoData } from "@workspace/ui/lib/data-model";
import { SeoDataTypeId } from "@workspace/ui/lib/data-model/sample-data";
import { allComponents } from "@workspace/ui/lib/generator/component-registry";
import type { ComponentDoc } from "@workspace/ui/types/generator/component-types";
import {
  usePagesState,
  makePageId,
  makeBlockId,
  type PageItem,
  type PageBlock,
} from "../../lib/pages-store";

// 頁面管理：頁面本身的新增 / 刪除 / 編輯，以及每頁的 SEO 設定與內容組件組合。
//
// 編輯採「草稿 + 明確儲存」模式（與資料管理一致）：
// 使用者輸入時只改本地草稿，按下「儲存」才寫回 store。
// 儲存按鈕只在有未儲存變更時出現。
//
// 版面：
//  - 左：現有組件 + 內容組合（所選頁面的 blocks）
//  - 右：頁面清單（含快速篩選、可收合的編輯功能）

const SEO_KEY_PREFIX = "wb.typedData.seo:page:";

type StatusFilter = "all" | "draft" | "published";

export default function PageManagerPage() {
  const [pages, setPages] = usePagesState();
  const [selectedId, setSelectedId] = useState<string | null>(pages[0]?.id ?? null);
  const [drafts, setDrafts] = useState<Record<string, PageItem>>({});
  const [saved, flashSaved] = useSavedFlash();

  // 頁面清單快速篩選
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const selected = pages.find((p) => p.id === selectedId) ?? null;
  const draft = selected ? (drafts[selected.id] ?? selected) : null;
  const dirty = selected ? drafts[selected.id] != null : false;

  // 篩選後的頁面清單
  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pages, filter, query]);

  const counts = useMemo(
    () => ({
      all: pages.length,
      published: pages.filter((p) => p.status === "published").length,
      draft: pages.filter((p) => p.status === "draft").length,
    }),
    [pages]
  );

  const addPage = () => {
    const id = makePageId();
    const next: PageItem = {
      id,
      name: "新頁面",
      status: "draft",
      seo: { ...defaultSeo },
      blocks: [],
    };
    setPages([...pages, next]);
    setSelectedId(id);
  };

  const deletePage = (id: string) => {
    const next = pages.filter((p) => p.id !== id);
    setPages(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    setDrafts((prev) => {
      if (!prev[id]) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  };

  const updateDraft = (patch: Partial<PageItem>) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    setDrafts({ ...drafts, [selected.id]: { ...base, ...patch } });
  };

  const updateSeoDraft = (patch: Partial<SeoData>) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    updateDraft({ seo: { ...base.seo, ...patch } });
  };

  // blocks 操作（直接改草稿）
  const addBlock = (component: ComponentDoc) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    const block: PageBlock = {
      instanceId: makeBlockId(),
      componentId: component.id,
      componentName: component.componentName,
      props: {},
    };
    updateDraft({ blocks: [...base.blocks, block] });
  };

  const removeBlock = (instanceId: string) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    updateDraft({ blocks: base.blocks.filter((b) => b.instanceId !== instanceId) });
  };

  const moveBlock = (instanceId: string, dir: -1 | 1) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    const idx = base.blocks.findIndex((b) => b.instanceId === instanceId);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= base.blocks.length) return;
    const next = [...base.blocks];
    [next[idx], next[target]] = [next[target], next[idx]];
    updateDraft({ blocks: next });
  };

  const updateBlockProp = (instanceId: string, key: string, value: unknown) => {
    if (!selected) return;
    const base = drafts[selected.id] ?? selected;
    updateDraft({
      blocks: base.blocks.map((b) =>
        b.instanceId === instanceId ? { ...b, props: { ...b.props, [key]: value } } : b
      ),
    });
  };

  const saveSelected = () => {
    if (!selected || !dirty) return;
    const next = drafts[selected.id];
    setPages(pages.map((p) => (p.id === selected.id ? next : p)));
    setDrafts((prev) => {
      const { [selected.id]: _drop, ...rest } = prev;
      return rest;
    });
    flashSaved();
  };

  const discardDraft = () => {
    if (!selected) return;
    setDrafts((prev) => {
      if (!prev[selected.id]) return prev;
      const { [selected.id]: _drop, ...rest } = prev;
      return rest;
    });
  };

  return (
    <AdminLayout
      title="頁面管理"
      description="新增、編輯、刪除網站頁面，並設定每一頁的 SEO 與內容組件組合。頁面路徑與 noindex 由「資料管理」設定。"
      actions={
        <>
          {saved && <span style={savedFlashStyle}>已儲存 ✓</span>}
          <button style={primaryBtnStyle} onClick={addPage} title="新增頁面">
            <Plus size={14} />
            新增頁面
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* 左：現有組件 + 內容組合 */}
        <section style={{ ...panelStyle, flex: 1, minWidth: 280, marginBottom: 0 }}>
          <ComponentComposer
            draft={draft}
            onAddBlock={addBlock}
            onRemoveBlock={removeBlock}
            onMoveBlock={moveBlock}
            onUpdateBlockProp={updateBlockProp}
          />
        </section>

        {/* 右：頁面清單（含快速篩選與可收合的編輯功能） */}
        <section style={{ ...panelStyle, flex: 2, minWidth: 340, marginBottom: 0 }}>
          <PageListPanel
            pages={pages}
            filteredPages={filteredPages}
            counts={counts}
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            drafts={drafts}
            draft={draft}
            dirty={dirty}
            onUpdateDraft={updateDraft}
            onUpdateSeoDraft={updateSeoDraft}
            onSave={saveSelected}
            onDiscard={discardDraft}
            onDelete={deletePage}
          />
        </section>
      </div>
    </AdminLayout>
  );
}

// ---------- 左：現有組件 + 內容組合 ----------

function ComponentComposer({
  draft,
  onAddBlock,
  onRemoveBlock,
  onMoveBlock,
  onUpdateBlockProp,
}: {
  draft: PageItem | null;
  onAddBlock: (component: ComponentDoc) => void;
  onRemoveBlock: (instanceId: string) => void;
  onMoveBlock: (instanceId: string, dir: -1 | 1) => void;
  onUpdateBlockProp: (instanceId: string, key: string, value: unknown) => void;
}) {
  const [componentQuery, setComponentQuery] = useState("");
  const filteredComponents = useMemo(() => {
    const q = componentQuery.trim().toLowerCase();
    if (!q) return allComponents;
    return allComponents.filter(
      (c) =>
        c.componentName.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [componentQuery]);

  return (
    <>
      <h2 style={panelTitleStyle}>現有組件（{allComponents.length}）</h2>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search
          size={14}
          style={{ position: "absolute", left: 10, top: 10, color: "#777" }}
        />
        <input
          style={{ ...inputStyle, paddingLeft: 30 }}
          placeholder="搜尋組件名稱或描述…"
          value={componentQuery}
          onChange={(e) => setComponentQuery(e.target.value)}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxHeight: 280,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        {filteredComponents.length === 0 && (
          <p style={{ color: "#777", fontSize: 13 }}>找不到符合的組件。</p>
        )}
        {filteredComponents.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #333",
              background: "#151515",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{c.componentName}</div>
              <div
                style={{
                  fontSize: 11,
                  color: "#888",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.description.replace(/\n/g, " ")}
              </div>
            </div>
            <button
              style={{ ...ghostBtnStyle, padding: "4px 8px", fontSize: 12 }}
              onClick={() => onAddBlock(c)}
              title="加入此頁內容"
              disabled={!draft}
            >
              <Plus size={12} />
              加入
            </button>
          </div>
        ))}
      </div>

      {/* 內容組合：所選頁面的 blocks */}
      <div
        style={{
          borderTop: "1px solid #333",
          margin: "16px 0 12px",
          paddingTop: 16,
        }}
      >
        <h3 style={{ fontSize: 13, color: "#ccc", margin: "0 0 4px" }}>內容組合</h3>
        <p style={{ fontSize: 11, color: "#777", margin: "0 0 12px" }}>
          {draft
            ? `頁面「${draft.name}」目前的組件順序（共 ${draft.blocks.length} 個）`
            : "請先選擇右側頁面。"}
        </p>
        {!draft || draft.blocks.length === 0 ? (
          <p style={{ color: "#777", fontSize: 13 }}>尚無組件，從上方「現有組件」加入。</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {draft.blocks.map((block, idx) => (
              <BlockEditor
                key={block.instanceId}
                block={block}
                index={idx}
                total={draft.blocks.length}
                onRemove={() => onRemoveBlock(block.instanceId)}
                onMoveUp={() => onMoveBlock(block.instanceId, -1)}
                onMoveDown={() => onMoveBlock(block.instanceId, 1)}
                onUpdateProp={(key, value) => onUpdateBlockProp(block.instanceId, key, value)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** 單一 block 編輯器：可收合，展開時可調整 props。 */
function BlockEditor({
  block,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
  onUpdateProp,
}: {
  block: PageBlock;
  index: number;
  total: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateProp: (key: string, value: unknown) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const component = allComponents.find((c) => c.id === block.componentId);

  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: 6,
        background: "#151515",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <GripVertical size={14} style={{ color: "#555", flexShrink: 0 }} />
        {expanded ? (
          <ChevronDown size={14} style={{ color: "#888", flexShrink: 0 }} />
        ) : (
          <ChevronRight size={14} style={{ color: "#888", flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 11, color: "#555", flexShrink: 0 }}>#{index + 1}</span>
        <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, flex: 1 }}>
          {block.componentName}
        </span>
        <div
          style={{ display: "flex", gap: 2, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            style={iconBtnStyle}
            onClick={onMoveUp}
            disabled={index === 0}
            title="上移"
          >
            <ArrowUp size={12} />
          </button>
          <button
            style={iconBtnStyle}
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="下移"
          >
            <ArrowDown size={12} />
          </button>
          <button style={iconBtnStyle} onClick={onRemove} title="移除">
            <X size={12} />
          </button>
        </div>
      </div>
      {expanded && component && (
        <div
          style={{
            borderTop: "1px solid #2a2a2a",
            padding: "10px 12px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {component.props.length === 0 && (
            <p style={{ color: "#777", fontSize: 12, margin: 0 }}>此組件無可設定 props。</p>
          )}
          {component.props.map((prop) => (
            <div key={prop.name} style={{ marginBottom: 0 }}>
              <label
                style={{
                  ...labelStyle,
                  display: "flex",
                  gap: 6,
                  alignItems: "baseline",
                }}
              >
                <span>{prop.name}</span>
                <span style={{ color: "#555", fontFamily: "monospace", fontSize: 10 }}>
                  {prop.type}
                </span>
                {prop.required && <span style={{ color: "#e77", fontSize: 10 }}>必填</span>}
              </label>
              <input
                style={inputStyle}
                value={String(block.props[prop.name] ?? "")}
                placeholder={
                  prop.defaultValue != null ? `預設: ${prop.defaultValue}` : "未設定"
                }
                onChange={(e) => onUpdateProp(prop.name, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}
      {expanded && !component && (
        <div style={{ borderTop: "1px solid #2a2a2a", padding: "10px 12px" }}>
          <p style={{ color: "#e77", fontSize: 12, margin: 0 }}>
            找不到此組件定義（{block.componentId}），可能已移除。
          </p>
        </div>
      )}
    </div>
  );
}

// ---------- 右：頁面清單（含篩選 + 可收合編輯） ----------

function PageListPanel({
  pages,
  filteredPages,
  counts,
  filter,
  setFilter,
  query,
  setQuery,
  selectedId,
  setSelectedId,
  drafts,
  draft,
  dirty,
  onUpdateDraft,
  onUpdateSeoDraft,
  onSave,
  onDiscard,
  onDelete,
}: {
  pages: PageItem[];
  filteredPages: PageItem[];
  counts: { all: number; published: number; draft: number };
  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  query: string;
  setQuery: (q: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  drafts: Record<string, PageItem>;
  draft: PageItem | null;
  dirty: boolean;
  onUpdateDraft: (patch: Partial<PageItem>) => void;
  onUpdateSeoDraft: (patch: Partial<SeoData>) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <h2 style={panelTitleStyle}>頁面清單（{pages.length}）</h2>

      {/* 快速篩選列 */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {(
          [
            { key: "all", label: "全部", count: counts.all },
            { key: "published", label: "已發布", count: counts.published },
            { key: "draft", label: "草稿", count: counts.draft },
          ] as { key: StatusFilter; label: string; count: number }[]
        ).map((tab) => (
          <button
            key={tab.key}
            style={filter === tab.key ? filterTabActiveStyle : filterTabStyle}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}（{tab.count}）
          </button>
        ))}
        <div style={{ position: "relative", flex: 1, minWidth: 140 }}>
          <Search
            size={14}
            style={{ position: "absolute", left: 10, top: 9, color: "#777" }}
          />
          <input
            style={{ ...inputStyle, paddingLeft: 30, height: 32 }}
            placeholder="搜尋頁面名稱或 ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {pages.length === 0 && (
        <p style={{ color: "#777", fontSize: 13 }}>尚無頁面，點右上角新增。</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filteredPages.map((p) => {
          const active = p.id === selectedId;
          const hasDraft = drafts[p.id] != null;
          const isExpanded = active;
          return (
            <PageRow
              key={p.id}
              page={p}
              active={active}
              hasDraft={hasDraft}
              expanded={isExpanded}
              draft={active ? draft : null}
              dirty={active && dirty}
              onSelect={() => setSelectedId(p.id)}
              onUpdateDraft={onUpdateDraft}
              onUpdateSeoDraft={onUpdateSeoDraft}
              onSave={onSave}
              onDiscard={onDiscard}
              onDelete={() => onDelete(p.id)}
            />
          );
        })}
        {filteredPages.length === 0 && pages.length > 0 && (
          <p style={{ color: "#777", fontSize: 13 }}>沒有符合篩選條件的頁面。</p>
        )}
      </div>
    </>
  );
}

/** 頁面清單中的一列：點擊展開即內嵌編輯功能（可收合）。 */
function PageRow({
  page,
  active,
  hasDraft,
  expanded,
  draft,
  dirty,
  onSelect,
  onUpdateDraft,
  onUpdateSeoDraft,
  onSave,
  onDiscard,
  onDelete,
}: {
  page: PageItem;
  active: boolean;
  hasDraft: boolean;
  expanded: boolean;
  draft: PageItem | null;
  dirty: boolean;
  onSelect: () => void;
  onUpdateDraft: (patch: Partial<PageItem>) => void;
  onUpdateSeoDraft: (patch: Partial<SeoData>) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: 6,
        border: active ? "1px solid #2d9c74" : "1px solid #333",
        background: active ? "#18271f" : "#151515",
        overflow: "hidden",
      }}
    >
      <div
        onClick={onSelect}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {expanded ? (
            <ChevronDown size={14} style={{ color: "#888", flexShrink: 0 }} />
          ) : (
            <ChevronRight size={14} style={{ color: "#888", flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {page.name}
              {hasDraft && (
                <span style={{ color: "#e8b64c", marginLeft: 6, fontSize: 11 }}>•</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#888" }}>{page.id}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {page.blocks.length > 0 && (
            <span style={{ fontSize: 10, color: "#777" }}>
              {page.blocks.length} 個組件
            </span>
          )}
          <span style={statusBadge(page.status)}>
            {page.status === "published" ? "已發布" : "草稿"}
          </span>
        </div>
      </div>

      {/* 展開的編輯區（原本的「編輯頁面」功能整合進來） */}
      {expanded && draft && (
        <div
          style={{
            borderTop: "1px solid #2d6a4f",
            padding: "14px 14px 4px",
            background: "#13201a",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ fontSize: 13, color: "#ccc", margin: 0 }}>編輯頁面</h3>
              <span style={typeBadgeStyle} title={SeoDataTypeId}>
                SeoData
              </span>
              {dirty && (
                <span style={{ fontSize: 11, color: "#e8b64c" }}>未儲存變更</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {dirty && (
                <>
                  <button style={ghostBtnStyle} onClick={onDiscard} title="放棄變更">
                    還原
                  </button>
                  <button style={primaryBtnStyle} onClick={onSave} title="儲存此頁">
                    <Save size={14} />
                    儲存
                  </button>
                </>
              )}
              <button style={dangerBtnStyle} onClick={onDelete} title="刪除此頁">
                <Trash2 size={14} />
                刪除此頁
              </button>
            </div>
          </div>

          <div style={fieldRowStyle}>
            <label style={labelStyle}>頁面名稱</label>
            <input
              style={inputStyle}
              value={draft.name}
              onChange={(e) => onUpdateDraft({ name: e.target.value })}
            />
          </div>

          <div style={fieldRowStyle}>
            <label style={labelStyle}>狀態</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["draft", "published"] as const).map((s) => (
                <button
                  key={s}
                  style={draft.status === s ? primaryBtnStyle : ghostBtnStyle}
                  onClick={() => onUpdateDraft({ status: s })}
                >
                  {s === "published" ? "已發布" : "草稿"}
                </button>
              ))}
            </div>
          </div>

          <p style={{ fontSize: 12, color: "#888", marginTop: 0 }}>
            頁面路徑與 noindex 由「資料管理 → 路由」設定。此頁綁定型別資料：
            <code> {SEO_KEY_PREFIX}{draft.id} </code>
            <br />
            內容組件組合在左側「現有組件」區塊管理（目前 {draft.blocks.length} 個）。
          </p>

          <div
            style={{
              borderTop: "1px solid #333",
              margin: "8px 0 14px",
              paddingTop: 12,
            }}
          >
            <h3 style={{ fontSize: 13, color: "#ccc", margin: "0 0 12px" }}>
              SEO 設定（綁定 SeoData）
            </h3>
            <SeoFields seo={draft.seo} onChange={onUpdateSeoDraft} />
          </div>
        </div>
      )}
    </div>
  );
}

function SeoFields({
  seo,
  onChange,
}: {
  seo: SeoData;
  onChange: (patch: Partial<SeoData>) => void;
}) {
  return (
    <>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>SEO 標題（title）</label>
        <input style={inputStyle} value={seo.title} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>標題模板（titleTemplate，%s = 頁面標題）</label>
        <input style={inputStyle} value={seo.titleTemplate} onChange={(e) => onChange({ titleTemplate: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>SEO 描述（description）</label>
        <textarea style={textareaStyle} value={seo.description} onChange={(e) => onChange({ description: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>關鍵字（keywords，逗號分隔）</label>
        <input style={inputStyle} value={seo.keywords} onChange={(e) => onChange({ keywords: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>OG 分享圖（ogImage）</label>
        <input style={inputStyle} value={seo.ogImage} onChange={(e) => onChange({ ogImage: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>OG 類型（ogType）</label>
        <select style={inputStyle} value={seo.ogType} onChange={(e) => onChange({ ogType: e.target.value as SeoData["ogType"] })}>
          <option value="website">website</option>
          <option value="article">article</option>
        </select>
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>Twitter 卡片類型（twitterCard）</label>
        <input style={inputStyle} value={seo.twitterCard} onChange={(e) => onChange({ twitterCard: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>Twitter 網站帳號（twitterSite）</label>
        <input style={inputStyle} value={seo.twitterSite} onChange={(e) => onChange({ twitterSite: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>標準網址（canonicalUrl）</label>
        <input style={inputStyle} value={seo.canonicalUrl} onChange={(e) => onChange({ canonicalUrl: e.target.value })} />
      </div>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>Robots 指令（robots）</label>
        <input style={inputStyle} value={seo.robots} onChange={(e) => onChange({ robots: e.target.value })} />
      </div>
    </>
  );
}

function statusBadge(status: PageItem["status"]): React.CSSProperties {
  const published = status === "published";
  return {
    flexShrink: 0,
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    color: published ? "#8fe" : "#eb9",
    background: published ? "#173029" : "#2b2417",
    border: `1px solid ${published ? "#2d9c74" : "#6b5a2a"}`,
  };
}

const typeBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#7fdbca",
  border: "1px solid #2d6a4f",
  background: "#173029",
  borderRadius: 4,
  padding: "1px 6px",
  fontFamily: "monospace",
};

const filterTabStyle: React.CSSProperties = {
  background: "#2d2d2d",
  color: "#ccc",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const filterTabActiveStyle: React.CSSProperties = {
  ...filterTabStyle,
  background: "#2d9c74",
  color: "#04150e",
  border: "1px solid #2d9c74",
  fontWeight: 600,
};

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "#aaa",
  border: "none",
  borderRadius: 4,
  padding: 4,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 0,
};
