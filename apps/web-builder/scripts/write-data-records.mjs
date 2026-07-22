/**
 * 把「資料管理」（/data，DataManager）編輯好的資料紀錄寫回
 * `data/{app}/records/{typeId}.json`。
 *
 * 僅在 `vite dev` 的 middleware（見 write-data-plugin.mjs）被呼叫，
 * build 產物不含這支腳本的呼叫路徑，不會有寫檔 API 外洩到正式環境的疑慮。
 *
 * 檔案配置：`data/{app}/records/{typeId}.json`（每個 app 底下、每個型別各一
 * 個檔案），跟 app.json / pages.json / routes.json 同一層再多一個 records/ 子目錄。
 * 檔案內容是 `{ [datasetName]: Dataset }`：
 *   - isArrayType=true  → { isArrayType: true,  name, items: DataRecordEntry[] }
 *   - isArrayType=false → { isArrayType: false, name, item: object, i18nBindings? }
 *
 * 對外的資料形狀維持 `{ [app]: { [typeId]: { [datasetName]: Dataset } } }`
 * （DataManagerData）不變，這一層負責 map <-> 個別檔案 的轉換，呼叫端
 * （plugin / 前端）無感，跟 write-routes.mjs 是同一套模式。
 */
import fs from 'node:fs';
import path from 'node:path';
import { isSafeId, appDir, listAppDirs, toRelative, readJsonFile, writeJsonFile } from './app-fs.mjs';

/** 回傳該 app 底下 records/{typeId}.json 的路徑（自行組裝，型別 id 只允許安全字元） */
function appRecordsFile(app, typeId) {
  if (!isSafeId(typeId)) {
    throw new Error(`不合法的型別 id：${JSON.stringify(typeId)}`);
  }
  return path.join(appDir(app), 'records', `${typeId}.json`);
}

/** 驗證單一筆 DataRecordEntry（id + value 物件），回傳清理過的物件，失敗回傳 error 訊息 */
function validateRecordEntry(app, typeId, datasetName, record, seenIds) {
  if (record == null || typeof record !== 'object' || Array.isArray(record)) {
    return { error: `app "${app}" 型別 "${typeId}" 資料集 "${datasetName}"：每筆資料都必須是物件` };
  }
  if (typeof record.id !== 'string' || record.id.length === 0) {
    return { error: `app "${app}" 型別 "${typeId}" 資料集 "${datasetName}"：不合法的資料 id：${JSON.stringify(record.id)}` };
  }
  if (seenIds.has(record.id)) {
    return { error: `app "${app}" 型別 "${typeId}" 資料集 "${datasetName}"：重複的資料 id：${record.id}` };
  }
  seenIds.add(record.id);

  if (record.value == null || typeof record.value !== 'object' || Array.isArray(record.value)) {
    return { error: `app "${app}" 型別 "${typeId}" 資料集 "${datasetName}"：資料 "${record.id}" 的 value 必須是物件` };
  }

  const clean = { id: record.id, value: record.value };
  if (record.i18nBindings !== undefined) {
    if (record.i18nBindings == null || typeof record.i18nBindings !== 'object' || Array.isArray(record.i18nBindings)) {
      return { error: `app "${app}" 型別 "${typeId}" 資料集 "${datasetName}"：資料 "${record.id}" 的 i18nBindings 必須是物件` };
    }
    clean.i18nBindings = record.i18nBindings;
  }
  return { clean };
}

/**
 * 驗證單一 Dataset（isArrayType=true 時含 items 陣列，false 時是單一 item 物件），
 * 回傳清理過的 Dataset，失敗回傳 error 訊息。
 */
function validateDataset(app, typeId, datasetName, dataset) {
  if (dataset == null || typeof dataset !== 'object' || Array.isArray(dataset)) {
    return { error: `app "${app}" 型別 "${typeId}" 資料集 "${datasetName}" 的內容必須是物件（Dataset）` };
  }
  if (typeof dataset.name !== 'string' || dataset.name.length === 0) {
    return { error: `app "${app}" 型別 "${typeId}" 資料集 "${datasetName}"：缺少合法的 name` };
  }

  if (dataset.isArrayType === true) {
    if (!Array.isArray(dataset.items)) {
      return { error: `app "${app}" 型別 "${typeId}" 資料集 "${datasetName}"：isArrayType=true 時 items 必須是陣列` };
    }
    const seenIds = new Set();
    const cleanItems = [];
    for (const record of dataset.items) {
      const result = validateRecordEntry(app, typeId, datasetName, record, seenIds);
      if (result.error) return { error: result.error };
      cleanItems.push(result.clean);
    }
    return { clean: { isArrayType: true, name: dataset.name, items: cleanItems } };
  }

  if (dataset.isArrayType === false) {
    if (dataset.item == null || typeof dataset.item !== 'object' || Array.isArray(dataset.item)) {
      return { error: `app "${app}" 型別 "${typeId}" 資料集 "${datasetName}"：isArrayType=false 時 item 必須是物件` };
    }
    const clean = { isArrayType: false, name: dataset.name, item: dataset.item };
    if (dataset.i18nBindings !== undefined) {
      if (dataset.i18nBindings == null || typeof dataset.i18nBindings !== 'object' || Array.isArray(dataset.i18nBindings)) {
        return { error: `app "${app}" 型別 "${typeId}" 資料集 "${datasetName}" 的 i18nBindings 必須是物件` };
      }
      clean.i18nBindings = dataset.i18nBindings;
    }
    return { clean };
  }

  return { error: `app "${app}" 型別 "${typeId}" 資料集 "${datasetName}"：isArrayType 必須是 true 或 false` };
}

/** 驗證單一 app + typeId 底下的 { [datasetName]: Dataset }，回傳清理過的物件，失敗回傳 error 訊息 */
function validateTypeDatasets(app, typeId, datasets) {
  if (datasets == null || typeof datasets !== 'object' || Array.isArray(datasets)) {
    return { error: `app "${app}" 型別 "${typeId}" 的內容必須是物件（datasetName -> Dataset）` };
  }

  const cleanDatasets = {};
  for (const datasetName of Object.keys(datasets)) {
    const result = validateDataset(app, typeId, datasetName, datasets[datasetName]);
    if (result.error) {
      return { error: result.error };
    }
    cleanDatasets[datasetName] = result.clean;
  }

  return { cleanDatasets };
}

/**
 * 驗證並寫入整份 dataManagerData（app -> typeId -> datasetName -> Dataset）：
 * 每個 app + typeId 組合各自寫進 `data/{app}/records/{typeId}.json`。
 *
 * @param {object} params
 * @param {unknown} params.dataManagerData  應為 Record<app, Record<typeId, Record<datasetName, Dataset>>> 物件
 * @returns {{ ok: true, writtenFiles: string[], appCount: number, recordCount: number } | { ok: false, error: string }}
 */
export function writeDataRecordsToDisk({ dataManagerData }) {
  try {
    if (dataManagerData == null || typeof dataManagerData !== 'object' || Array.isArray(dataManagerData)) {
      return { ok: false, error: 'dataManagerData 必須是物件（app -> typeId -> datasetName -> Dataset）' };
    }

    const apps = Object.keys(dataManagerData);
    for (const app of apps) {
      if (!isSafeId(app)) {
        return { ok: false, error: `不合法的 app 名稱：${JSON.stringify(app)}（只允許英數字、底線、連字號）` };
      }
    }

    const writtenFiles = [];
    let recordCount = 0;

    for (const app of apps) {
      const typesForApp = dataManagerData[app];
      if (typesForApp == null || typeof typesForApp !== 'object' || Array.isArray(typesForApp)) {
        return { ok: false, error: `app "${app}" 的內容必須是物件（typeId -> datasetName -> Dataset）` };
      }

      for (const typeId of Object.keys(typesForApp)) {
        if (!isSafeId(typeId)) {
          return { ok: false, error: `不合法的型別 id：${JSON.stringify(typeId)}（只允許英數字、底線、連字號）` };
        }
        const result = validateTypeDatasets(app, typeId, typesForApp[typeId]);
        if (result.error) {
          return { ok: false, error: result.error };
        }
        const filePath = appRecordsFile(app, typeId);
        writeJsonFile(filePath, result.cleanDatasets);
        writtenFiles.push(toRelative(filePath));
        for (const dataset of Object.values(result.cleanDatasets)) {
          recordCount += dataset.isArrayType ? dataset.items.length : 1;
        }
      }
    }

    return {
      ok: true,
      writtenFiles,
      appCount: apps.length,
      recordCount,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 讀取目前磁碟上所有 app 的 records/*.json，組成 DataManagerData
 * （`{ [app]: { [typeId]: { [datasetName]: Dataset } } }`），供 GET API 使用。
 */
export function readAllDataRecordsFromDisk() {
  const dataManagerData = {};
  for (const app of listAppDirs()) {
    const recordsDir = path.join(appDir(app), 'records');
    if (!fs.existsSync(recordsDir)) {
      dataManagerData[app] = {};
      continue;
    }
    const typesForApp = {};
    for (const fileName of fs.readdirSync(recordsDir)) {
      if (!fileName.toLowerCase().endsWith('.json')) continue;
      const typeId = fileName.slice(0, -'.json'.length);
      typesForApp[typeId] = readJsonFile(path.join(recordsDir, fileName), {});
    }
    dataManagerData[app] = typesForApp;
  }
  return dataManagerData;
}

export { toRelative };
