import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/hooks/app/context';
import {
  loadAppFiles,
  addFiles,
  updateFile,
  removeFile,
  loadAutoSyncTargets,
  saveAutoSyncTargets,
} from '@/store/file-storage';
import {
  isOpfsSupported,
  writeOpfsFile,
  readOpfsFile,
  createOpfsObjectUrl,
} from '@/lib/opfs-file-store';
import { uploadFileToDisk, deleteFileFromDisk, isDiskUploadLikelyAvailable } from '@/lib/files-disk-api';
import { uploadFileToS3, deleteFileFromS3, isS3UploadLikelyAvailable } from '@workspace/browser/s3-upload-client';
import { loadAppsData } from '@/store/settings-storage';
import type { AppStorageProvider } from '@/types/types';
import { formatFileSize, isImageMimeType, type FileEntry } from '@/types/file-types';
import { fileManagerStyles as styles } from '@/styles/file-manager-styles';
import { cn } from '@workspace/ui/utils/utils';

/**
 * `/files` — app 底下的檔案管理子功能。
 *
 * 儲存策略：
 *   - metadata（檔名 / mimeType / size / 備註 / 時間戳 / 各儲存位置同步狀態）
 *     存在瀏覽器 localStorage（見 src/store/file-storage.ts），跟
 *     pages / i18n / routes 同一套「即時同步、不用按鈕」模式。
 *   - 檔案「本體」上傳當下一律先寫進瀏覽器 OPFS（Origin Private File
 *     System，見 src/lib/opfs-file-store.ts；預設值，永遠存在）。
 *   - 「本機檔案系統」與「S3 相容節點」是可以並存的「額外」同步目的地
 *     （見 FileEntry.locations），是否提供由 app 設定的
 *     `AppSettings.storage.providers`（可複選）決定：
 *       - 包含 'local'：可額外同步到 `public/uploads/{app}/`（dev only，見
 *         src/lib/files-disk-api.ts）。
 *       - 包含 's3'：可額外同步到 S3 / R2（透過 presigned URL 直接上傳，
 *         dev only，見 @workspace/browser 套件的 s3-upload-client.ts；
 *         物件 key 一律保留原始副檔名，見 @workspace/server 套件的
 *         presign.mjs 的 buildObjectKey）。
 *     這裡的「上傳目的地管理」面板讓使用者用 icon 按鈕勾選「上傳新檔案時
 *     要自動同步到哪些目的地」，選中狀態會用顏色標示；面板選項只有在 app
 *     設定裡實際啟用該 provider 時才會出現。
 *
 * 支援：
 *   - 拖拉上傳（也可點擊選擇檔案），檔案本體立即寫入 OPFS，並依「上傳目的地
 *     管理」面板目前勾選的目的地自動同步
 *   - 圖片類型會顯示縮圖預覽（卡片檢視 / 表格檢視皆有，OPFS 檔案以
 *     objectURL 即時建立，元件卸載或項目切換時會釋放）
 *   - CRUD：新增（上傳）、檢視詳情與預覽、編輯備註、刪除（會一併清掉已同步
 *     的本機 / S3 本體，避免留下孤兒檔案，見 deleteEntryBodies）
 *   - 多選批次刪除（勾選框 + 全選 + 「刪除選取」，同樣會清掉每筆檔案已同步
 *     的本機 / S3 本體）
 *   - 同一筆檔案可同時查看在 OPFS / 本機 / S3 的同步狀態（徽章列）
 *   - 卡片式 / 表格式兩種檢視切換、關鍵字搜尋
 *
 * 目前 app 統一取自最外層 layout 的切換 dropdown（見 `useApp`），
 * 這裡不再帶 `:app` 路由參數。
 */

type ViewMode = 'grid' | 'list';

function iconFor(mimeType: string): string {
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️';
  if (mimeType.startsWith('text/')) return '📝';
  return '📁';
}

/** 安全取得 FileEntry.locations，相容舊資料（storageKind 版本）沒有 locations 欄位的情況。 */
function safeLocations(entry: FileEntry): FileEntry['locations'] {
  return entry.locations ?? {};
}

/**
 * 依 FileEntry 目前的同步狀態取得可用來預覽 / 下載的 URL，優先序：
 * 已同步的磁碟網址 > 已同步的 S3 網址 > 即時從 OPFS 讀出建立 objectURL。
 * 回傳 null 代表目前讀不到本體（例如 OPFS 檔案已經不存在）。
 */
async function resolvePreviewUrl(app: string, entry: FileEntry): Promise<string | null> {
  const locations = safeLocations(entry);
  if (locations.disk?.synced && locations.disk.url) return locations.disk.url;
  if (locations.s3?.synced && locations.s3.url) return locations.s3.url;
  return createOpfsObjectUrl(app, entry.id);
}

/** 縮圖 / 預覽用的小元件：優先用已同步的靜態網址，否則即時建立 OPFS objectURL。 */
function FileThumb({
  app,
  entry,
  className,
  iconClassName,
}: {
  app: string;
  entry: FileEntry;
  className: string;
  iconClassName: string;
}) {
  const staticUrl = safeLocations(entry).disk?.url ?? safeLocations(entry).s3?.url ?? null;
  const [src, setSrc] = useState<string | null>(staticUrl);

  useEffect(() => {
    if (!entry.isImage) return;
    if (staticUrl) {
      setSrc(staticUrl);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void createOpfsObjectUrl(app, entry.id).then((url) => {
      if (cancelled) return;
      objectUrl = url;
      setSrc(url);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [app, entry.id, entry.isImage, staticUrl]);

  if (!entry.isImage) {
    return (
      <span className={iconClassName} aria-hidden="true">
        {iconFor(entry.mimeType)}
      </span>
    );
  }
  if (!src) {
    return (
      <span className={iconClassName} aria-hidden="true">
        ⏳
      </span>
    );
  }
  return <img src={src} alt={entry.name} className={className} />;
}

/** 一筆檔案目前各儲存位置的同步狀態徽章列：OPFS 永遠顯示（預設本體），本機 / S3 視實際同步狀態顯示。 */
function StorageBadgeRow({ entry }: { entry: FileEntry }) {
  const locations = safeLocations(entry);
  return (
    <span className={styles.badgeRow}>
      <span className={cn(styles.badge, styles.badgeOpfs)}>OPFS</span>
      {locations.disk?.synced && <span className={cn(styles.badge, styles.badgeDisk)}>磁碟</span>}
      {locations.s3?.synced && <span className={cn(styles.badge, styles.badgeS3)}>S3</span>}
    </span>
  );
}

export function FileManager() {
  const { app } = useApp();
  const activeNs = app ?? null;

  const [refreshKey, setRefreshKey] = useState(0);
  const files = useMemo<FileEntry[]>(() => {
    if (!activeNs) return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return loadAppFiles(activeNs);
  }, [activeNs, refreshKey]);

  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);

  // 多選批次刪除：勾選的檔案 id 集合，切換 app 或搜尋條件時不特別清空，
  // 但檔案被刪除或清單重新整理後，選取狀態只會保留仍存在的 id（見下方 effect）。
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  const opfsSupported = useMemo(() => isOpfsSupported(), []);
  const diskEnvAvailable = useMemo(() => isDiskUploadLikelyAvailable(), []);
  const s3EnvAvailable = useMemo(() => isS3UploadLikelyAvailable(), []);

  // app 設定裡實際啟用的儲存供應商（可複選），只有出現在這裡的選項，
  // 「上傳目的地管理」面板才會顯示對應的按鈕。讀 localStorage 快照即可，
  // 實際連線設定是否完整由各自的 API 呼叫結果把關。
  const configuredProviders = useMemo<AppStorageProvider[]>(() => {
    if (!activeNs) return [];
    const settings = loadAppsData()[activeNs];
    return settings?.storage?.providers ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNs, refreshKey]);

  const diskOptionVisible = diskEnvAvailable && configuredProviders.includes('local');
  const s3OptionVisible = s3EnvAvailable && configuredProviders.includes('s3');

  // 「上傳新檔案時要自動同步到哪些目的地」——使用者在「上傳目的地管理」
  // 面板勾選的目的地。改為以 activeNs 為 key 存進 localStorage（見
  // src/store/file-storage.ts 的 loadAutoSyncTargets /
  // saveAutoSyncTargets），重新整理頁面、切換分頁都會保留勾選狀態，
  // 不會再出現「勾了 S3 卻在重整後顯示沒設定」的不一致。
  const [autoSyncTargets, setAutoSyncTargetsState] = useState<Set<Extract<AppStorageProvider, 'local' | 's3'>>>(
    new Set()
  );

  // app 切換時，從該 app 對應的 localStorage 紀錄重新載入勾選狀態。
  useEffect(() => {
    if (!activeNs) {
      setAutoSyncTargetsState(new Set());
      return;
    }
    setAutoSyncTargetsState(new Set(loadAutoSyncTargets(activeNs)));
  }, [activeNs]);

  /** 更新自動同步目標並同步寫回 localStorage（以目前 activeNs 為 key）。 */
  function setAutoSyncTargets(
    updater: (prev: Set<Extract<AppStorageProvider, 'local' | 's3'>>) => Set<Extract<AppStorageProvider, 'local' | 's3'>>
  ) {
    setAutoSyncTargetsState((prev) => {
      const next = updater(prev);
      if (activeNs) saveAutoSyncTargets(activeNs, Array.from(next));
      return next;
    });
  }

  // 若面板選項因為 app 切換而消失（例如切到另一個未啟用 S3 的 app），
  // 一併清掉已經不存在的選項，避免殘留無效的自動同步目標。
  useEffect(() => {
    setAutoSyncTargets((prev) => {
      const next = new Set(prev);
      if (!diskOptionVisible) next.delete('local');
      if (!s3OptionVisible) next.delete('s3');
      return next;
    });
  }, [diskOptionVisible, s3OptionVisible]);

  function toggleAutoSyncTarget(target: 'local' | 's3') {
    setAutoSyncTargets((prev) => {
      const next = new Set(prev);
      if (next.has(target)) next.delete(target);
      else next.add(target);
      return next;
    });
  }

  useEffect(() => {
    if (!activeFile) return;
    setEditDescription(activeFile.description ?? '');
  }, [activeFile]);

  // 開啟詳情彈窗時，即時解析預覽用的 URL（OPFS 需要非同步讀取）。
  useEffect(() => {
    if (!activeFile || !activeNs) {
      setActivePreviewUrl(null);
      return;
    }
    const usesOpfs = !safeLocations(activeFile).disk?.synced && !safeLocations(activeFile).s3?.synced;
    let cancelled = false;
    let objectUrl: string | null = null;
    void resolvePreviewUrl(activeNs, activeFile).then((url) => {
      if (cancelled) return;
      if (usesOpfs) objectUrl = url;
      setActivePreviewUrl(url);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeFile, activeNs]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }

  const filteredFiles = useMemo(() => {
    if (!search.trim()) return files;
    const q = search.trim().toLowerCase();
    return files.filter(
      (f) => f.name.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q)
    );
  }, [files, search]);

  // 檔案清單變動（例如切換 app、刪除檔案）後，清掉選取集合裡已經不存在的 id。
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(files.map((f) => f.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [files]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allFilteredSelected = filteredFiles.length > 0 && filteredFiles.every((f) => selectedIds.has(f.id));

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filteredFiles.forEach((f) => next.delete(f.id));
        return next;
      }
      const next = new Set(prev);
      filteredFiles.forEach((f) => next.add(f.id));
      return next;
    });
  }

  /** 把單一檔案（已寫入 OPFS）依目前勾選的自動同步目標，額外同步到本機 / S3。 */
  async function autoSyncNewEntry(entryId: string, file: File): Promise<string[]> {
    if (!activeNs) return [];
    const notes: string[] = [];

    if (autoSyncTargets.has('local')) {
      const diskResult = await uploadFileToDisk(activeNs, entryId, file);
      if (diskResult.ok) {
        updateFile(activeNs, entryId, {
          locations: {
            ...(loadAppFiles(activeNs).find((f) => f.id === entryId)?.locations ?? {}),
            disk: { synced: true, url: diskResult.url, storedName: diskResult.storedName, syncedAt: new Date().toISOString() },
          },
        });
        notes.push('已同步至本機');
      } else {
        notes.push(`本機同步失敗：${diskResult.error}`);
      }
    }

    if (autoSyncTargets.has('s3')) {
      const s3Result = await uploadFileToS3(activeNs, file);
      if (s3Result.ok) {
        updateFile(activeNs, entryId, {
          locations: {
            ...(loadAppFiles(activeNs).find((f) => f.id === entryId)?.locations ?? {}),
            s3: { synced: true, url: s3Result.url, key: s3Result.key, syncedAt: new Date().toISOString() },
          },
        });
        notes.push('已同步至 S3');
      } else {
        notes.push(`S3 同步失敗：${s3Result.error}`);
      }
    }

    return notes;
  }

  async function handleFileList(fileList: FileList | File[]) {
    if (!activeNs) return;
    const list = Array.from(fileList);
    if (list.length === 0) return;

    if (!opfsSupported) {
      showToast('目前瀏覽器不支援 OPFS（檔案系統儲存），無法上傳檔案');
      return;
    }

    setIsUploading(true);
    try {
      const entries: FileEntry[] = [];
      const failed: string[] = [];
      const syncNotes: string[] = [];

      for (const file of list) {
        const id = crypto.randomUUID();
        try {
          // 檔案本體先寫進 OPFS（預設本體），寫入成功後才登記 metadata，
          // 避免「metadata 有紀錄但本體寫入失敗」的不一致狀態。
          await writeOpfsFile(activeNs, id, file);
          const now = new Date().toISOString();
          entries.push({
            id,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            locations: {},
            isImage: isImageMimeType(file.type),
            createdAt: now,
            updatedAt: now,
          });
        } catch (err) {
          failed.push(`${file.name}（${err instanceof Error ? err.message : '寫入失敗'}）`);
        }
      }

      if (entries.length > 0) {
        const ok = addFiles(activeNs, entries);
        setRefreshKey((k) => k + 1);
        if (ok) {
          showToast(`已新增 ${entries.length} 個檔案（存放於瀏覽器 OPFS）`);
        } else {
          showToast('metadata 儲存失敗：瀏覽器 localStorage 容量已滿，請刪除一些既有檔案後再試一次');
        }

        // 依「上傳目的地管理」面板目前勾選的目的地，逐一額外同步。
        if (autoSyncTargets.size > 0) {
          for (let i = 0; i < entries.length; i++) {
            const notes = await autoSyncNewEntry(entries[i].id, list[i]);
            syncNotes.push(...notes);
          }
          setRefreshKey((k) => k + 1);
        }
      }
      if (failed.length > 0) {
        showToast(`${failed.join('、')} 上傳失敗`);
      } else if (syncNotes.length > 0) {
        showToast(syncNotes.join('、'));
      }
    } finally {
      setIsUploading(false);
    }
  }

  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const filesArr = Array.from(list);
    e.target.value = '';
    await handleFileList(filesArr);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (!activeNs) return;
    const list = e.dataTransfer.files;
    if (!list || list.length === 0) return;
    await handleFileList(list);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
  }

  /**
   * 刪除單一檔案：先刪除已同步的額外本體（本機 / S3，若存在），
   * 再交給 removeFile 清掉 metadata 與 OPFS 本體。
   * 本機 / S3 刪除失敗不會擋下 metadata 的刪除（避免刪不掉遠端檔案就
   * 卡住整個操作），但會在 toast 裡提示使用者。
   */
  async function deleteEntryBodies(app: string, entry: FileEntry): Promise<string[]> {
    const notes: string[] = [];
    const locations = safeLocations(entry);

    if (locations.disk?.synced && locations.disk.storedName) {
      const result = await deleteFileFromDisk(app, locations.disk.storedName);
      if (!result.ok) notes.push(`本機檔案刪除失敗：${result.error}`);
    }

    if (locations.s3?.synced && locations.s3.key) {
      const result = await deleteFileFromS3(app, locations.s3.key);
      if (!result.ok) notes.push(`S3 檔案刪除失敗：${result.error}`);
    }

    return notes;
  }

  async function handleRemove(id: string, name: string) {
    if (!activeNs) return;
    if (!window.confirm(`確定要刪除檔案「${name}」？此動作無法復原。`)) return;

    const entry = files.find((f) => f.id === id);
    const notes = entry ? await deleteEntryBodies(activeNs, entry) : [];

    removeFile(activeNs, id);
    if (activeFile?.id === id) setActiveFile(null);
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setRefreshKey((k) => k + 1);
    showToast(notes.length > 0 ? `已刪除「${name}」，但 ${notes.join('、')}` : `已刪除「${name}」`);
  }

  /** 批次刪除目前勾選的檔案：逐筆清掉已同步的本機 / S3 本體，再刪除 metadata。 */
  async function handleBatchRemove() {
    if (!activeNs || selectedIds.size === 0) return;
    const targets = files.filter((f) => selectedIds.has(f.id));
    if (targets.length === 0) return;
    if (!window.confirm(`確定要刪除選取的 ${targets.length} 個檔案？此動作無法復原。`)) return;

    setIsBatchDeleting(true);
    try {
      const allNotes: string[] = [];
      for (const entry of targets) {
        const notes = await deleteEntryBodies(activeNs, entry);
        allNotes.push(...notes.map((n) => `${entry.name}：${n}`));
        removeFile(activeNs, entry.id);
      }
      if (activeFile && selectedIds.has(activeFile.id)) setActiveFile(null);
      setSelectedIds(new Set());
      setRefreshKey((k) => k + 1);
      showToast(
        allNotes.length > 0
          ? `已刪除 ${targets.length} 個檔案，但部分遠端本體刪除失敗：${allNotes.join('、')}`
          : `已刪除 ${targets.length} 個檔案`
      );
    } finally {
      setIsBatchDeleting(false);
    }
  }

  function handleSaveDescription() {
    if (!activeNs || !activeFile) return;
    updateFile(activeNs, activeFile.id, { description: editDescription.trim() || undefined });
    setRefreshKey((k) => k + 1);
    setActiveFile(null);
    showToast('已更新備註');
  }

  /** 把既有檔案（存在 OPFS 的本體）手動補同步一份到本機 `public/uploads/{app}/`（dev only）。 */
  async function handleSyncToDisk(entry: FileEntry) {
    if (!activeNs) return;
    setSyncingId(entry.id);
    try {
      const file = await readOpfsFile(activeNs, entry.id);
      if (!file) {
        showToast(`「${entry.name}」在 OPFS 中已找不到本體，無法同步`);
        return;
      }
      const result = await uploadFileToDisk(activeNs, entry.id, file);
      if (!result.ok) {
        showToast(`上傳失敗：${result.error}（請確認目前是 npm run dev 開發模式）`);
        return;
      }
      updateFile(activeNs, entry.id, {
        locations: {
          ...safeLocations(entry),
          disk: { synced: true, url: result.url, storedName: result.storedName, syncedAt: new Date().toISOString() },
        },
      });
      setRefreshKey((k) => k + 1);
      showToast(`「${entry.name}」已同步到 public/uploads/${activeNs}/`);
    } finally {
      setSyncingId(null);
    }
  }

  /**
   * 把既有檔案（存在 OPFS 的本體），透過 dev server 取得 presigned URL 後，
   * 直接 PUT 上傳到 app 設定裡的 S3 / R2 節點（dev only，見
   * @workspace/browser 套件的 s3-upload-client.ts）。檔案本體不經過
   * dev server 中轉，物件 key 一律保留原始副檔名。
   */
  async function handleSyncToS3(entry: FileEntry) {
    if (!activeNs) return;
    setSyncingId(entry.id);
    try {
      const file = await readOpfsFile(activeNs, entry.id);
      if (!file) {
        showToast(`「${entry.name}」在 OPFS 中已找不到本體，無法同步`);
        return;
      }
      const result = await uploadFileToS3(activeNs, file);
      if (!result.ok) {
        showToast(`上傳到 S3 失敗：${result.error}`);
        return;
      }
      updateFile(activeNs, entry.id, {
        locations: {
          ...safeLocations(entry),
          s3: { synced: true, url: result.url, key: result.key, syncedAt: new Date().toISOString() },
        },
      });
      setRefreshKey((k) => k + 1);
      showToast(`「${entry.name}」已上傳至 S3（${result.key}）`);
    } finally {
      setSyncingId(null);
    }
  }

  if (!app) {
    return (
      <div className={styles.wrap}>
        <div className={styles.header}>
          <h1 className={styles.title}>檔案管理</h1>
          <p className={styles.subtitle}>請先在最上方選擇一個 app。</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>檔案管理 · {app}</h1>
        <p className={styles.subtitle}>
          管理這個 app 底下上傳的檔案：可拖拉或選擇檔案上傳，圖片類型會顯示縮圖預覽。
          檔案本體一律先存放於瀏覽器 <code>OPFS</code>（容量遠大於 localStorage，適合大檔案），
          並可依下方「上傳目的地管理」面板勾選的目的地，額外同步到本機或 S3。
          {!opfsSupported && '（目前瀏覽器不支援 OPFS，上傳功能無法使用，建議改用 Chrome / Edge 等現代瀏覽器）'}
        </p>
      </div>

      {(diskOptionVisible || s3OptionVisible) && (
        <div className={styles.targetPanel}>
          <span className={styles.targetPanelLabel}>上傳目的地管理：</span>
          {diskOptionVisible && (
            <button
              type="button"
              className={cn(styles.targetBtn, autoSyncTargets.has('local') && styles.targetBtnActiveDisk)}
              onClick={() => toggleAutoSyncTarget('local')}
              aria-pressed={autoSyncTargets.has('local')}
              title="上傳新檔案時，自動額外同步到本機 public/uploads/{app}/"
            >
              <span className={styles.targetBtnIcon} aria-hidden="true">
                {autoSyncTargets.has('local') ? '✅' : '💾'}
              </span>
              本機檔案系統
            </button>
          )}
          {s3OptionVisible && (
            <button
              type="button"
              className={cn(styles.targetBtn, autoSyncTargets.has('s3') && styles.targetBtnActiveS3)}
              onClick={() => toggleAutoSyncTarget('s3')}
              aria-pressed={autoSyncTargets.has('s3')}
              title="上傳新檔案時，自動額外同步到 S3 / R2"
            >
              <span className={styles.targetBtnIcon} aria-hidden="true">
                {autoSyncTargets.has('s3') ? '✅' : '☁️'}
              </span>
              S3 / R2
            </button>
          )}
          <span className={styles.targetPanelHint}>
            選項只會列出「App 設定」裡已啟用的儲存方式；選中的目的地，之後新上傳的檔案會自動同步過去
            （OPFS 一律預設寫入，不受這裡影響）。既有檔案可在詳情彈窗或列表操作補同步。
          </span>
        </div>
      )}

      <div
        className={cn(styles.dropzone, isDragOver && styles.dropzoneActive)}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <span className={styles.dropzoneIcon} aria-hidden="true">
          ⬆️
        </span>
        <div className={styles.dropzoneText}>
          <p className={styles.dropzoneTitle}>拖曳檔案到這裡上傳</p>
          <p className={styles.dropzoneHint}>支援多檔案與大檔案，圖片會自動顯示縮圖預覽</p>
        </div>
        <div className={styles.dropzoneActions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={triggerFilePicker}
            disabled={isUploading || !opfsSupported}
          >
            {isUploading ? '上傳中…' : '選擇檔案'}
          </button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileInputChange} />
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.count}>共 {files.length} 個檔案</span>
          <input
            className={styles.search}
            placeholder="搜尋檔名或備註..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filteredFiles.length > 0 && (
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} />
              全選
            </label>
          )}
          {selectedIds.size > 0 && (
            <>
              <span className={styles.count}>已選取 {selectedIds.size} 個</span>
              <button
                type="button"
                className={cn(styles.btn, 'border-destructive/40 text-destructive hover:bg-destructive/10')}
                onClick={handleBatchRemove}
                disabled={isBatchDeleting}
              >
                {isBatchDeleting ? '刪除中…' : `刪除選取（${selectedIds.size}）`}
              </button>
            </>
          )}
        </div>
        <div className={styles.viewToggle}>
          <button
            type="button"
            className={cn(styles.viewToggleBtn, viewMode === 'grid' && styles.viewToggleBtnActive)}
            onClick={() => setViewMode('grid')}
          >
            卡片
          </button>
          <button
            type="button"
            className={cn(styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive)}
            onClick={() => setViewMode('list')}
          >
            列表
          </button>
        </div>
      </div>

      {filteredFiles.length === 0 ? (
        <div className={styles.empty}>
          {files.length === 0 ? '這個 app 底下還沒有任何檔案，可拖拉檔案到上方區塊上傳。' : '找不到符合搜尋條件的檔案。'}
        </div>
      ) : viewMode === 'grid' ? (
        <div className={styles.grid}>
          {filteredFiles.map((f) => (
            <div key={f.id} className={cn(styles.card, selectedIds.has(f.id) && styles.cardSelected)}>
              <label className={styles.cardSelectCheckbox} onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => toggleSelected(f.id)} />
              </label>
              <button type="button" className={styles.cardThumb} onClick={() => setActiveFile(f)} title="檢視詳情">
                <FileThumb app={app} entry={f} className={styles.cardThumbImg} iconClassName={styles.cardThumbIcon} />
              </button>
              <div className={styles.cardBody}>
                <span className={styles.cardName} title={f.name}>
                  {f.name}
                </span>
                <span className={styles.cardMeta}>
                  {formatFileSize(f.size)} <StorageBadgeRow entry={f} />
                </span>
              </div>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.cardIconBtn}
                  onClick={() => setActiveFile(f)}
                  title="檢視 / 編輯"
                >
                  ✎
                </button>
                <button
                  type="button"
                  className={cn(styles.cardIconBtn, styles.cardIconBtnDanger)}
                  onClick={() => handleRemove(f.id, f.name)}
                  title="刪除"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th className={styles.th}>
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} />
              </th>
              <th className={styles.th}>預覽</th>
              <th className={styles.th}>檔名</th>
              <th className={styles.th}>類型</th>
              <th className={styles.th}>大小</th>
              <th className={styles.th}>儲存位置</th>
              <th className={styles.th}>備註</th>
              <th className={cn(styles.th, 'text-right')}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredFiles.map((f) => (
              <tr key={f.id} className={cn(styles.tr, selectedIds.has(f.id) && styles.trSelected)}>
                <td className={styles.td}>
                  <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => toggleSelected(f.id)} />
                </td>
                <td className={styles.td}>
                  <div className={styles.thumbCell}>
                    <FileThumb app={app} entry={f} className={styles.thumbImg} iconClassName={styles.thumbIcon} />
                  </div>
                </td>
                <td className={cn(styles.td, styles.nameCell)}>{f.name}</td>
                <td className={cn(styles.td, styles.metaCell)}>{f.mimeType}</td>
                <td className={cn(styles.td, styles.metaCell)}>{formatFileSize(f.size)}</td>
                <td className={styles.td}>
                  <StorageBadgeRow entry={f} />
                </td>
                <td className={cn(styles.td, styles.descCell)}>{f.description || '—'}</td>
                <td className={cn(styles.td, styles.actionsCell)}>
                  {!safeLocations(f).disk?.synced && diskOptionVisible && (
                    <button
                      type="button"
                      className={styles.syncBtn}
                      onClick={() => handleSyncToDisk(f)}
                      disabled={syncingId === f.id}
                    >
                      {syncingId === f.id ? '同步中…' : '補同步到本機'}
                    </button>
                  )}
                  {!safeLocations(f).s3?.synced && s3OptionVisible && (
                    <button
                      type="button"
                      className={styles.syncBtn}
                      onClick={() => handleSyncToS3(f)}
                      disabled={syncingId === f.id}
                    >
                      {syncingId === f.id ? '同步中…' : '補同步到 S3'}
                    </button>
                  )}
                  <button type="button" className={styles.removeButton} onClick={() => setActiveFile(f)}>
                    編輯
                  </button>
                  <button type="button" className={styles.removeButton} onClick={() => handleRemove(f.id, f.name)}>
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {activeFile && (
        <div className={styles.modalOverlay} onClick={() => setActiveFile(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{activeFile.name}</h2>
              <button type="button" className={styles.modalClose} onClick={() => setActiveFile(null)}>
                ✕
              </button>
            </div>

            <div className={styles.modalPreview}>
              {activeFile.isImage && activePreviewUrl ? (
                <img src={activePreviewUrl} alt={activeFile.name} className={styles.modalPreviewImg} />
              ) : (
                <span className={styles.cardThumbIcon} aria-hidden="true">
                  {activeFile.isImage ? '⏳' : iconFor(activeFile.mimeType)}
                </span>
              )}
            </div>

            <div className={styles.modalMetaRow}>
              <span>類型：{activeFile.mimeType}</span>
              <span>大小：{formatFileSize(activeFile.size)}</span>
              <span className="flex items-center gap-1.5">
                儲存位置：<StorageBadgeRow entry={activeFile} />
              </span>
              {safeLocations(activeFile).disk?.synced && <span>磁碟網址：{safeLocations(activeFile).disk!.url}</span>}
              {safeLocations(activeFile).s3?.synced && <span>S3 網址：{safeLocations(activeFile).s3!.url}</span>}
              <span>上傳時間：{new Date(activeFile.createdAt).toLocaleString()}</span>
            </div>

            {!safeLocations(activeFile).disk?.synced && diskOptionVisible && (
              <div>
                <button
                  type="button"
                  className={styles.syncBtn}
                  onClick={() => handleSyncToDisk(activeFile)}
                  disabled={syncingId === activeFile.id}
                >
                  {syncingId === activeFile.id ? '同步中…' : '補同步到本機（public/uploads）'}
                </button>
              </div>
            )}

            {!safeLocations(activeFile).s3?.synced && s3OptionVisible && (
              <div>
                <button
                  type="button"
                  className={styles.syncBtn}
                  onClick={() => handleSyncToS3(activeFile)}
                  disabled={syncingId === activeFile.id}
                >
                  {syncingId === activeFile.id ? '同步中…' : '補同步到 S3（presigned URL）'}
                </button>
              </div>
            )}

            <div className={styles.modalField}>
              <label className={styles.modalFieldLabel} htmlFor="file-description">
                備註（選填）
              </label>
              <textarea
                id="file-description"
                className={styles.modalTextarea}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="這個檔案的用途說明"
              />
            </div>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnGhost} onClick={() => setActiveFile(null)}>
                取消
              </button>
              <button
                type="button"
                className={cn(styles.btn, 'border-destructive/40 text-destructive hover:bg-destructive/10')}
                onClick={() => handleRemove(activeFile.id, activeFile.name)}
              >
                刪除檔案
              </button>
              <button type="button" className={styles.btnPrimary} onClick={handleSaveDescription}>
                儲存備註
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
