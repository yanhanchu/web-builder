// 綁定候選查詢：集中管理「每種 BindingKind 底下有哪些可綁定的 key」，
// 內部各自認識對應的 store（i18n-storage / data-manager-storage），
// 呼叫端（小視窗、管理頁）只需要知道自己要哪個型別、要查哪個 app，
// 不需要認識任何 store 或個別 kind 的資料形狀。
//
// 加一種新的 BindingKind，只需要在這裡多寫一個查詢函式並加進
// `listCandidates`，不影響既有 kind、也不影響小視窗或呼叫端。

import { loadI18nData, loadI18nMetaData } from "@/store/i18n-storage";
import { loadDatasets } from "@/store/data-manager-storage";
import { collectAllKeys } from "@/utils/i18n-utils";
import type { ParsedField } from "@/types/data-manager-types";
import {
  type BindingKind,
  type BindableValueType,
  i18nValueTypeToBindable,
  dataFieldKindToBindable,
} from "@/types/binding-types";

/** 單一候選項：可選來源的 key、顯示用文字、實際值型別。 */
export interface BindingCandidate {
  refKey: string;
  label: string;
  valueType: BindableValueType;
}

/** 列出某個 app 底下所有 i18n key 候選項（值型別依 KeyTypeMap 標記，預設 string）。 */
function listI18nCandidates(app: string): BindingCandidate[] {
  const data = loadI18nData();
  const meta = loadI18nMetaData();
  const keys = collectAllKeys(data[app] ?? {});
  const keyTypes = meta[app] ?? {};
  return keys.map((key) => ({
    refKey: key,
    label: key,
    valueType: i18nValueTypeToBindable(keyTypes[key] ?? "string"),
  }));
}

/**
 * 列出某個 app、某組 typeId 底下所有 data record 欄位候選項。
 * `typeIds` 由呼叫端提供（見 data-manager.tsx 從 component.relatedTypeNames
 * 推導可用型別的既有邏輯），這裡不重新推導「哪些型別跟這個 component 相關」，
 * 只負責「給定 typeId 之後，把底下每個 dataset 的每個欄位攤平成候選項」。
 * refKey 格式："{typeId}:{datasetName}:{fieldPath}"（單一物件型 dataset）或
 * "{typeId}:{datasetName}:{itemId}:{fieldPath}"（陣列型 dataset）。
 */
function listDataRecordCandidates(
  app: string,
  typeIds: { typeId: string; typeName: string; fields: ParsedField[] }[],
): BindingCandidate[] {
  const candidates: BindingCandidate[] = [];

  function pushField(
    prefixKey: string,
    prefixLabel: string,
    field: ParsedField,
  ) {
    const valueType = dataFieldKindToBindable(
      field.kind === "unsupported" ? "unsupported" : field.kind,
      field.kind !== "unsupported" && field.isArray,
    );
    if (field.kind === "object" && !field.isArray) {
      for (const child of field.children) {
        pushField(`${prefixKey}.${field.name}`, `${prefixLabel} > ${field.name}`, child);
      }
      return;
    }
    candidates.push({
      refKey: `${prefixKey}.${field.name}`,
      label: `${prefixLabel} > ${field.name}`,
      valueType,
    });
  }

  for (const { typeId, typeName, fields } of typeIds) {
    const datasets = loadDatasets(app, typeId);
    for (const [datasetName, dataset] of Object.entries(datasets)) {
      if (dataset.isArrayType) {
        for (const item of dataset.items) {
          const prefixKey = `${typeId}:${datasetName}:${item.id}`;
          const prefixLabel = `${typeName} / ${datasetName} #${item.id.slice(0, 6)}`;
          for (const field of fields) pushField(prefixKey, prefixLabel, field);
        }
      } else {
        const prefixKey = `${typeId}:${datasetName}`;
        const prefixLabel = `${typeName} / ${datasetName}`;
        for (const field of fields) pushField(prefixKey, prefixLabel, field);
      }
    }
  }
  return candidates;
}

/**
 * 列出某個 kind 底下的所有候選項，並依 `targetType` 過濾掉型別不相容的候選。
 * `targetType` 為 undefined 時不過濾（回傳全部）。
 *
 * `dataRecordTypeIds` 僅在查詢 kind === 'dataRecord' 時需要提供
 * （見 listDataRecordCandidates 的說明），其餘 kind 忽略此參數。
 */
export function listCandidates(
  kind: BindingKind,
  app: string,
  targetType: BindableValueType | undefined,
  dataRecordTypeIds?: { typeId: string; typeName: string; fields: ParsedField[] }[],
): BindingCandidate[] {
  let all: BindingCandidate[];
  switch (kind) {
    case "i18n":
      all = listI18nCandidates(app);
      break;
    case "dataRecord":
      all = listDataRecordCandidates(app, dataRecordTypeIds ?? []);
      break;
    default:
      all = [];
  }
  if (!targetType) return all;
  return all.filter((c) => c.valueType === targetType);
}
