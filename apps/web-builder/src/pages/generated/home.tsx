// 此檔案由 scripts/generate-pages.mjs 依 data/pages.json 自動產生，請勿手動編輯。
// 若要修改頁面內容，請編輯來源 JSON 後重新執行 `npm run pages:generate`。

import { Badge } from '@workspace/ui/components/demo/badge';
import { Card, CardHeader } from '@workspace/ui/components/demo/card';
import { Button } from '@workspace/ui/components/ui/button';

/** 首頁 */
export function HomePage() {
  return (
    <div className="mx-auto max-w-[720px] px-6 pt-8 pb-16" data-page-id="home">
      <h1>首頁</h1>
      <Card
        interactive={true}
        padding={24}
        children="test"
      >
        <Button
          variant="primary"
          size="md"
        >
          立即開始
        </Button>
        test
      </Card>
      <Card
        interactive={true}
        padding={16}
      >
        <CardHeader
          title="巢狀範例"
        />
        <Badge
          tone="info"
        >
          外層文字 - 
          <Badge
            tone="warning"
            dot={true}
          >
            內層 Badge（示範多層遞迴）
          </Badge>
        </Badge>
        <Badge>
          新文字節點
        </Badge>
      </Card>
      新文字節點
    </div>
  );
}

export default HomePage;
