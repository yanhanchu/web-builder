/**
 * 通用的「依 filePath 目錄結構分組成樹」工具，Components 與 Functions 側邊欄共用。
 * 不綁定 ComponentDoc / FunctionDoc 的具體型別，只要求有 `filePath` 這個欄位即可，
 * 用泛型 T 讓兩邊的資料型別各自維持原本的型別資訊（leaf.doc 不會被弱化成 unknown）。
 */
export interface DocTreeFolder<T> {
  type: 'folder';
  name: string;
  path: string;
  children: DocTreeNode<T>[];
}

export interface DocTreeLeaf<T> {
  type: 'leaf';
  name: string;
  path: string;
  index: number;
  doc: T;
}

export type DocTreeNode<T> = DocTreeFolder<T> | DocTreeLeaf<T>;

interface DocWithFilePathAndName {
  filePath: string;
}

/**
 * 把扁平的資料陣列依照 `filePath` 的目錄結構組成樹。
 * `index` 是它在原始陣列中的位置，用來組出 `/xxx/by-index/:index` 這種不會撞名的路由——
 * 兩個不同目錄下同名的項目（例如 `Button/Button.tsx` 與 `ui/button.tsx`）用 `id` 查找
 * 永遠只會拿到第一筆，用陣列 index 才能唯一定位。
 */
export function buildDocTree<T extends DocWithFilePathAndName>(
  items: T[],
  getName: (item: T) => string
): DocTreeNode<T>[] {
  const root: DocTreeNode<T>[] = [];

  items.forEach((doc, index) => {
    const segments = doc.filePath.split('/').filter(Boolean);
    // 最後一段是檔名，不當作資料夾層。
    const folderSegments = segments.slice(0, -1);

    let currentLevel = root;
    let currentPath = '';

    for (const segment of folderSegments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let folder = currentLevel.find(
        (n): n is DocTreeFolder<T> => n.type === 'folder' && n.path === currentPath
      );
      if (!folder) {
        folder = { type: 'folder', name: segment, path: currentPath, children: [] };
        currentLevel.push(folder);
      }
      currentLevel = folder.children;
    }

    currentLevel.push({
      type: 'leaf',
      name: getName(doc),
      path: doc.filePath,
      index,
      doc,
    });
  });

  sortTree(root);
  return root;
}

// 資料夾排在檔案前面，同類型依名稱排序，畫面掃視起來比較穩定、不會每次 build 順序亂跳。
function sortTree<T>(nodes: DocTreeNode<T>[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.type === 'folder') sortTree(node.children);
  }
}

/**
 * 依關鍵字過濾樹狀結構，用於側邊欄的搜尋框。
 * - leaf 節點比對顯示名稱與完整 filePath（不分大小寫），符合其一就保留。
 * - folder 節點只要底下任何一個後代 leaf 符合，就整條路徑保留下來。
 * - 關鍵字為空字串時直接回傳原始樹，不做任何過濾。
 */
export function filterDocTree<T>(nodes: DocTreeNode<T>[], query: string): DocTreeNode<T>[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return nodes;

  const filterNodes = (list: DocTreeNode<T>[]): DocTreeNode<T>[] =>
    list.reduce<DocTreeNode<T>[]>((acc, node) => {
      if (node.type === 'leaf') {
        const matches =
          node.name.toLowerCase().includes(trimmed) || node.path.toLowerCase().includes(trimmed);
        if (matches) acc.push(node);
        return acc;
      }

      const filteredChildren = filterNodes(node.children);
      if (filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren });
      }
      return acc;
    }, []);

  return filterNodes(nodes);
}
