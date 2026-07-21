/**
 * 把「資料管理」（/data，DataManager）編輯好的資料紀錄寫回
 * `data/{app}/records/{typeId}.json`。
 *
 * 僅在 `vite dev` 的 middleware（見 write-data-plugin.mjs）被呼叫，
 * build 產物不含這支腳本的呼叫路徑，不會有寫檔 API 外洩到正式環境的疑慮。
 *
 * 檔案配置：`data/{app}/records/{typeId}.json`（每個 app 底下、每個型別各一
 * 個檔案），跟 app.json / pages.json / routes.json 同一層再多一個 records/ 子目錄。
 *
 * 對外的資料形狀維持 `{ [app]: { [typeId]: DataRecordEntry[] } }`
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

/** 驗證單一 app + typeId 底下的 DataRecordEntry[] 陣列，回傳清理過的陣列，失敗回傳 error 訊息 */
function validateTypeRecords(app, typeId, records) {
  if (!Array.isArray(records)) {
    return { error: `app "${app}" 型別 "${typeId}" 的內容必須是陣列` };
  }

  const seenIds = new Set();
  const cleanRecords = [];
  for (const record of records) {
    if (record == null || typeof record !== 'object' || Array.isArray(record)) {
      return { error: `app "${app}" 型別 "${typeId}"：每筆資料都必須是物件` };
    }
    if (typeof record.id !== 'string' || record.id.length === 0) {
      return { error: `app "${app}" 型別 "${typeId}"：不合法的資料 id：${JSON.stringify(record.id)}` };
    }
    if (seenIds.has(record.id)) {
      return { error: `app "${app}" 型別 "${typeId}"：重複的資料 id：${record.id}` };
    }
    seenIds.add(record.id);

    if (record.value == null || typeof record.value !== 'object' || Array.isArray(record.value)) {
      return { error: `app "${app}" 型別 "${typeId}"：資料 "${record.id}" 的 value 必須是物件` };
    }

    cleanRecords.push({ id: record.id, value: record.value });
  }

  return { cleanRecords };
}

/**
 * 驗證並寫入整份 dataManagerData（app -> typeId -> DataRecordEntry[]）：
 * 每個 app + typeId 組合各自寫進 `data/{app}/records/{typeId}.json`。
 *
 * @param {object} params
 * @param {unknown} params.dataManagerData  應為 Record<app, Record<typeId, DataRecordEntry[]>> 物件
 * @returns {{ ok: true, writtenFiles: string[], appCount: number, recordCount: number } | { ok: false, error: string }}
 */
export function writeDataRecordsToDisk({ dataManagerData }) {
  try {
    if (dataManagerData == null || typeof dataManagerData !== 'object' || Array.isArray(dataManagerData)) {
      return { ok: false, error: 'dataManagerData 必須是物件（app -> typeId -> DataRecordEntry[]）' };
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
        return { ok: false, error: `app "${app}" 的內容必須是物件（typeId -> DataRecordEntry[]）` };
      }

      for (const typeId of Object.keys(typesForApp)) {
        if (!isSafeId(typeId)) {
          return { ok: false, error: `不合法的型別 id：${JSON.stringify(typeId)}（只允許英數字、底線、連字號）` };
        }
        const result = validateTypeRecords(app, typeId, typesForApp[typeId]);
        if (result.error) {
          return { ok: false, error: result.error };
        }
        const filePath = appRecordsFile(app, typeId);
        writeJsonFile(filePath, result.cleanRecords);
        writtenFiles.push(toRelative(filePath));
        recordCount += result.cleanRecords.length;
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
 * （`{ [app]: { [typeId]: DataRecordEntry[] } }`），供 GET API 使用。
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
      typesForApp[typeId] = readJsonFile(path.join(recordsDir, fileName), []);
    }
    dataManagerData[app] = typesForApp;
  }
  return dataManagerData;
}

export { toRelative };
