import * as demoDefaults from "@workspace/ui/components/demo/default";
import * as landing1Defaults from "@workspace/ui/components/landing1/default";

/**
 * 每個組件在 Live Preview 用的示範 props。
 * 預設值直接 import 自各目錄的 default.ts（單一事實來源），
 * 避免這裡跟 default.ts 各自維護一份、日後改一邊忘了改另一邊。
 */
/** default.ts 裡的匯出都是具體 interface（無 index signature），這裡統一抹除型別以符合本表的 value 型別 */
function asDemoProps(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

export const demoPropsById: Record<string, Record<string, unknown>> = {
  'src/components/demo/button.tsx#Button': asDemoProps(demoDefaults.button),
  'src/components/demo/badge.tsx#Badge': asDemoProps(demoDefaults.badge),
  'src/components/demo/card.tsx#Card': asDemoProps(demoDefaults.card),
  'src/components/demo/card.tsx#CardHeader': asDemoProps(demoDefaults.cardHeader),
  'src/components/demo/input.tsx#Input': asDemoProps(demoDefaults.input),
  'src/components/demo/avatar.tsx#Avatar': asDemoProps(demoDefaults.avatar),
  'src/components/demo/brand.tsx#Brand': asDemoProps(demoDefaults.brand),
  'src/components/demo/header.tsx#Header': asDemoProps(demoDefaults.header),
  'src/components/landing1/brand.tsx#Brand': asDemoProps(landing1Defaults.brand),
  'src/components/landing1/button.tsx#Button': asDemoProps(landing1Defaults.button),
  'src/components/landing1/contact-card.tsx#ContactCard': asDemoProps(landing1Defaults.contactCard),
  'src/components/landing1/cta-banner.tsx#CtaBanner': asDemoProps(landing1Defaults.ctaBanner),
  'src/components/landing1/footer.tsx#Footer': asDemoProps(landing1Defaults.footer),
  'src/components/landing1/header.tsx#Header': asDemoProps(landing1Defaults.header),
  'src/components/landing1/hero.tsx#Hero': asDemoProps(landing1Defaults.hero),
  'src/components/landing1/layout.tsx#Layout': asDemoProps(landing1Defaults.layout),
  'src/components/landing1/page-intro.tsx#PageIntro': asDemoProps(landing1Defaults.pageIntro),
  'src/components/landing1/section-list.tsx#SectionList': asDemoProps(landing1Defaults.sectionList),
  'src/components/landing1/theme-toggle.tsx#ThemeToggle': asDemoProps(landing1Defaults.themeToggle),
  'src/components/landing1/value-props.tsx#ValueProps': asDemoProps(landing1Defaults.valueProps),
};