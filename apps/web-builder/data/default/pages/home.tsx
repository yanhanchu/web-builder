// 此檔案由 scripts/generate-pages.mjs 依 data/default/pages.json 自動產生，請勿手動編輯。
// 若要修改頁面內容，請編輯來源 JSON 後重新執行 `npm run pages:generate`。

import { Avatar } from '@workspace/ui/components/demo/avatar';
import { Badge } from '@workspace/ui/components/demo/badge';
import { Button } from '@workspace/ui/components/demo/button';
import { Card, CardHeader } from '@workspace/ui/components/demo/card';
import { Input } from '@workspace/ui/components/demo/input';

/** 首頁 */
export function HomePage() {
  return (
    <div className="mx-auto max-w-[720px] px-6 pt-8 pb-16" data-page-id="home">
      <h1>首頁</h1>
      <Card
        interactive={false}
        padding={24}
      >
        <CardHeader
          title="歡迎使用"
          subtitle="這是一個由 JSON 遞迴生成的頁面"
        />
        這段文字直接放在 Card 裡面，示範純文字 children。。
        <Badge
          tone="success"
          dot={true}
        >
          已上線
        </Badge>
        <Button
          variant="primary"
          size="md"
        >
          立即開始
        </Button>
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
        <Input
          label="Email address"
          helperText="我們不會公開你的信箱"
        />
      </Card>
      <Avatar
        name=""
      />
    </div>
  );
}

export default HomePage;
