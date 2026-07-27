// ============================================================
// S3 相容節點的 Presigned URL 產生器（AWS Signature Version 4）
//
// 純前端上傳的做法：前端先跟這個 dev server 要一個「已簽名的
// PUT URL」，之後直接拿這個 URL 對 S3 / MinIO / R2 / B2 等節點
// 發 PUT 請求上傳檔案本體，檔案內容完全不會經過這個 server。
//
// Content-Length 檢查：presign 時若帶了 contentLength，會把
// "content-length" 這個標頭一併鎖進 SignedHeaders（見
// presignQueryString 的 extraSignedHeaders），瀏覽器發 PUT 時
// body 大小必須跟簽名時宣告的完全一致，S3 端才會驗簽通過 ——
// 這是「S3 端強制檢查」，不只是 upload-dev-plugin.ts 那層在
// presign 當下對宣告值做的數字上限驗證。
//
// 這裡刻意不依賴 @aws-sdk/client-s3，直接用 Node 內建的
// node:crypto 手刻 SigV4（query-string 簽名 / "presigned URL"
// 那一種，規格見 AWS 文件 "Authenticating Requests: Using Query
// Parameters (AWS Signature Version 4)"），原因：
//   1. 任務要求不安裝任何相依套件、不做建置驗證。
//   2. SigV4 的 query-string 簽名法本身就是給「無 SDK 環境」
//      設計的（瀏覽器 / curl 都能直接發請求），手刻也才幾十行，
//      不需要整包 SDK。
// ============================================================

import crypto from "node:crypto";
import type { S3UploadDest } from "../src/lib/upload-destinations.types";

const DEFAULT_EXPIRES_SECONDS = 60 * 5; // 5 分鐘內要完成上傳

function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function toAmzDate(d: Date): { amzDate: string; dateStamp: string } {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20260726T113000Z
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/** RFC 3986 percent-encoding，AWS 要求 "~" 不能被跳脫，其餘照標準 encodeURIComponent 即可。 */
function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** S3 物件 key 裡的 "/" 要維持原樣（代表路徑分隔），其餘字元照 RFC 3986 編碼。 */
function encodeS3Key(key: string): string {
  return key.split("/").map(rfc3986Encode).join("/");
}

/** 判斷一個 host 字串是不是裸 IP（IPv4 或 IPv6，含中括號寫法），例如 "192.168.123.11" 或 "[::1]"。 */
function isIpHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv4.test(bare) || (bare.includes(":") && ipv6.test(bare));
}

function resolveHost(dest: S3UploadDest): {
  protocol: string;
  host: string;
  pathPrefix: string;
} {
  if (dest.endpoint) {
    let url: URL;
    try {
      url = new URL(dest.endpoint);
    } catch {
      throw new Error(
        `此 S3 目的地的 endpoint 不是合法網址：「${dest.endpoint}」，請填完整網址（需含 http:// 或 https:// 開頭，例如 https://s3.example.com）`,
      );
    }
    const protocol = url.protocol.replace(":", "");
    // IP 位址（常見於自架 MinIO）無法當 virtual-hosted-style 的父網域
    // （"bucket.192.168.x.x" 不是合法網域），一律強制用 path-style，
    // 跟 AWS SDK 對 IP-style endpoint 的行為一致，不管 forcePathStyle
    // 有沒有勾選。
    const usePathStyle = dest.forcePathStyle || isIpHost(url.hostname);
    if (usePathStyle) {
      return { protocol, host: url.host, pathPrefix: `/${dest.bucket}` };
    }
    // virtual-hosted-style：把 bucket 疊到 endpoint 的 host 前面
    return {
      protocol,
      host: `${dest.bucket}.${url.host}`,
      pathPrefix: "",
    };
  }
  // 沒填 endpoint -> 使用 AWS 官方端點
  const region = dest.region || "us-east-1";
  const host =
    region === "us-east-1"
      ? `${dest.bucket}.s3.amazonaws.com`
      : `${dest.bucket}.s3.${region}.amazonaws.com`;
  return { protocol: "https", host, pathPrefix: "" };
}

export interface PresignPutParams {
  dest: S3UploadDest;
  /** 物件 key（例如 "uploads/2026/07/xxxx.png"），需已含副檔名。 */
  key: string;
  /** 選填：預先鎖定 Content-Type，之後瀏覽器 PUT 時必須帶完全相同的 header。 */
  contentType?: string;
  /**
   * 選填：預先鎖定 Content-Length（bytes）。有帶的話會一併簽進
   * SignedHeaders（跟 host 同層），瀏覽器實際 PUT 時，body 大小必須
   * 跟這裡宣告的完全一致，S3 端才會驗簽通過 —— 等於讓 S3 相容節點
   * 強制檢查上傳內容的位元組數，不只是這個 dev server 自己驗證。
   */
  contentLength?: number;
  expiresSeconds?: number;
}

export interface PresignPutResult {
  /** 前端直接對這個 URL 發 PUT（body 是檔案本體）即可完成上傳。 */
  uploadUrl: string;
  /** 前端發 PUT 時必須帶上這些 header（簽了 Content-Type 和／或 Content-Length 就會出現在這裡），值不對簽名就會驗證失敗。 */
  requiredHeaders: Record<string, string>;
  method: "PUT";
  expiresAt: string;
}

/**
 * 手刻 SigV4 query-string 簽名。目前只有 PUT（presignPutObject）會用到；
 * 原本 GET 版本（presignGetObject）是給 server 端「跨目的地同步」讀取
 * 私有 bucket 用的，同步流程已整個搬到前端執行，這個 server 現在只做
 * presign 和列出，所以 GET 簽名連同同步邏輯一併移除，這裡只保留 PUT。
 */
function presignQueryString(params: {
  dest: S3UploadDest;
  method: "PUT";
  key: string;
  expiresSeconds: number;
  /** 要一併簽進 SignedHeaders 的額外標頭（目前只會用來放 content-length）。key 一律小寫。 */
  extraSignedHeaders?: Record<string, string>;
}): { url: string; expiresAt: string } {
  const { dest, method, key, expiresSeconds, extraSignedHeaders = {} } = params;
  const region = dest.region || "auto";
  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const { protocol, host, pathPrefix } = resolveHost(dest);

  const canonicalUri = `${pathPrefix}/${encodeS3Key(key)}`;
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${dest.accessKeyId}/${credentialScope}`;

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": ["host", ...Object.keys(extraSignedHeaders)].join(";"),
  };

  const sortedKeys = Object.keys(queryParams).sort();
  const canonicalQuery = sortedKeys
    .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(queryParams[k])}`)
    .join("&");

  // canonical headers 必須依「標頭名稱」字母序排列，"content-length" < "host"
  const allHeaders: Record<string, string> = { host, ...extraSignedHeaders };
  const signedHeaderNames = Object.keys(allHeaders).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${allHeaders[name]}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  // presigned URL 事先不知道內容（PUT 是瀏覽器待上傳的檔案），
  // payload hash 固定用 AWS 官方支援的 UNSIGNED-PAYLOAD。
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${dest.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const finalQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;

  return {
    url: `${protocol}://${host}${canonicalUri}?${finalQuery}`,
    expiresAt: new Date(now.getTime() + expiresSeconds * 1000).toISOString(),
  };
}

/**
 * 產生 S3 PutObject 的 presigned URL（query-string 簽名版本）。
 * 相容 AWS S3、MinIO、Cloudflare R2、Backblaze B2 等任何走 SigV4 的節點。
 *
 * 有帶 contentLength 的話，會把 "content-length" 這個標頭鎖進
 * SignedHeaders，前端 PUT 時瀏覽器會依 body 大小自動帶上對應的
 * Content-Length header；只要跟這裡簽的值不同，S3 端驗簽就會失敗，
 * 等於讓 S3 相容節點強制檢查上傳內容的位元組數是否符合預期
 * （不只是這個 dev server 自己在 presign 當下做的數字上限檢查）。
 */
export function presignPutObject(params: PresignPutParams): PresignPutResult {
  const {
    dest,
    key,
    contentType,
    contentLength,
    expiresSeconds = DEFAULT_EXPIRES_SECONDS,
  } = params;

  const extraSignedHeaders: Record<string, string> = {};
  if (contentLength != null) {
    extraSignedHeaders["content-length"] = String(contentLength);
  }

  const { url, expiresAt } = presignQueryString({
    dest,
    method: "PUT",
    key,
    expiresSeconds,
    extraSignedHeaders,
  });

  const requiredHeaders: Record<string, string> = {};
  if (contentType) requiredHeaders["Content-Type"] = contentType;
  if (contentLength != null) {
    requiredHeaders["Content-Length"] = String(contentLength);
  }

  return {
    uploadUrl: url,
    requiredHeaders,
    method: "PUT",
    expiresAt,
  };
}

/** 簽好的 URL 上傳成功後，物件的「公開網址」（若有設定 publicBaseUrl 就用它，否則退回節點本身網址）。 */
export function resolvePublicUrl(dest: S3UploadDest, key: string): string {
  if (dest.publicBaseUrl) {
    return `${dest.publicBaseUrl.replace(/\/+$/, "")}/${encodeS3Key(key)}`;
  }
  const { protocol, host, pathPrefix } = resolveHost(dest);
  return `${protocol}://${host}${pathPrefix}/${encodeS3Key(key)}`;
}