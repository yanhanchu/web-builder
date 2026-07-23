/**
 * 每個組件在 Live Preview 用的示範 props。
 * 這張表是手動維護的（無法從型別自動推導出「有意義」的示範資料），
 * 若新增組件卻忘記加，LivePreview 會用空物件渲染（多數組件仍可正常顯示預設值）。
 */
export const demoPropsById: Record<string, Record<string, unknown>> = {
  'src/components/demo/button.tsx#Button': { children: 'Continue', variant: 'primary' },
  'src/components/demo/badge.tsx#Badge': { children: 'In progress', tone: 'info', dot: true },
  'src/components/demo/card.tsx#Card': { children: 'Card content goes here.' },
  'src/components/demo/card.tsx#CardHeader': { title: 'Team members', subtitle: '4 people in this workspace' },
  'src/components/demo/input.tsx#Input': { label: 'Email address', placeholder: 'you@example.com' },
  'src/components/demo/avatar.tsx#Avatar': { name: 'Jane Cooper' },
};
