// ============================================================
// 檔名工具：產生不會互撞的儲存檔名，同時保留原始副檔名
// ============================================================

import path from "node:path";
import crypto from "node:crypto";

/**
 * 從原始檔名擷取副檔名（含開頭的 "."），沒有副檔名則回傳空字串。
 * 例如 "photo.PNG" -> ".PNG"、"archive.tar.gz" -> ".gz"、"README" -> ""。
 */
export function getExtension(originalName: string): string {
  const ext = path.extname(originalName || "");
  // 避免整個檔名本身就是以 "." 開頭（例如 ".gitignore"）被誤判成「只有副檔名」
  if (!ext || ext === originalName) return "";
  return ext;
}

/**
 * 產生一個安全、唯一、且保留副檔名的儲存檔名。
 * 格式：<timestamp>-<random>.<ext>，例如 1737800000000-a1b2c3d4.png
 */
export function makeStoredFileName(originalName: string): string {
  const ext = getExtension(originalName);
  const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  return `${unique}${ext}`;
}

/** 兩層路徑穿越防護：拒絕 appName / 檔名裡出現的 ".." 或路徑分隔符號。 */
export function isSafePathSegment(segment: string): boolean {
  return (
    typeof segment === "string" &&
    segment.length > 0 &&
    !segment.includes("..") &&
    !segment.includes("/") &&
    !segment.includes("\\")
  );
}
