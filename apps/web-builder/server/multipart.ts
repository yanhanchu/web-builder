// ============================================================
// 極簡 multipart/form-data 解析器（零依賴）
//
// 只支援本機上傳 API 需要的最小子集：把每個 part 解析成
// { name, filename?, contentType?, data }，檔案內容整包讀進記憶體
// 後回傳 Buffer（開發用途，先不做串流寫檔）。
// ============================================================

export interface MultipartField {
  name: string;
  filename?: string;
  contentType?: string;
  data: Buffer;
}

function parseContentDisposition(headerLine: string): {
  name?: string;
  filename?: string;
} {
  const nameMatch = /name="([^"]*)"/.exec(headerLine);
  const filenameMatch = /filename="([^"]*)"/.exec(headerLine);
  return {
    name: nameMatch?.[1],
    filename: filenameMatch?.[1],
  };
}

/**
 * 解析整包 multipart/form-data 的 body。
 * @param body 完整的 request body（已讀完）
 * @param contentType request 的 Content-Type header（要從裡面取 boundary）
 */
export function parseMultipart(
  body: Buffer,
  contentType: string,
): MultipartField[] {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) {
    throw new Error("Content-Type 缺少 multipart boundary");
  }

  const boundaryBuf = Buffer.from(`--${boundary}`);
  const fields: MultipartField[] = [];

  let searchStart = 0;
  const boundaryIndices: number[] = [];
  while (true) {
    const idx = body.indexOf(boundaryBuf, searchStart);
    if (idx === -1) break;
    boundaryIndices.push(idx);
    searchStart = idx + boundaryBuf.length;
  }

  for (let i = 0; i < boundaryIndices.length - 1; i++) {
    const partStart = boundaryIndices[i] + boundaryBuf.length;
    const partEnd = boundaryIndices[i + 1];
    // 每個 part 開頭緊接著 boundary 之後是 "\r\n"，結尾前也有 "\r\n" 才接下一個 boundary
    let chunk = body.subarray(partStart, partEnd);
    // 去掉結尾的 "\r\n"（緊接在下個 boundary 前）
    if (chunk.subarray(-2).equals(Buffer.from("\r\n"))) {
      chunk = chunk.subarray(0, -2);
    }
    // 去掉開頭的 "\r\n"
    if (chunk.subarray(0, 2).equals(Buffer.from("\r\n"))) {
      chunk = chunk.subarray(2);
    } else {
      // 這是最後一個 "--boundary--" 之前那段，或空白段落，略過
      continue;
    }

    const headerEnd = chunk.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headerText = chunk.subarray(0, headerEnd).toString("utf-8");
    const data = chunk.subarray(headerEnd + 4);

    const headerLines = headerText.split("\r\n");
    const dispositionLine = headerLines.find((l) =>
      /^content-disposition:/i.test(l),
    );
    const contentTypeLine = headerLines.find((l) =>
      /^content-type:/i.test(l),
    );
    if (!dispositionLine) continue;

    const { name, filename } = parseContentDisposition(dispositionLine);
    if (!name) continue;

    fields.push({
      name,
      filename,
      contentType: contentTypeLine
        ?.split(":")
        .slice(1)
        .join(":")
        .trim(),
      data: Buffer.from(data),
    });
  }

  return fields;
}
