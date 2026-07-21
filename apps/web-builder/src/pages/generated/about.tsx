// 此檔案由 scripts/generate-pages.mjs 依 data/pages.json 自動產生，請勿手動編輯。
// 若要修改頁面內容，請編輯來源 JSON 後重新執行 `npm run pages:generate`。

import { Avatar } from '@workspace/ui/components/demo/avatar';
import { Card, CardHeader } from '@workspace/ui/components/demo/card';

/** 關於 */
export function AboutPage() {
  return (
    <div className="mx-auto max-w-[720px] px-6 pt-8 pb-16" data-page-id="about">
      <h1>關於</h1>
      <Card>
        <CardHeader
          title="關於本站"
        />
        這是第二個頁面，示範多頁面 JSON 生成。
        <Avatar
          name="Jane Cooper"
          size={48}
        />
      </Card>
      <Avatar
        name=""
      />
    </div>
  );
}

export default AboutPage;
