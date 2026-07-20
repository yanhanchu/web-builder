/**
 * 每個組件在 Live Preview 用的示範 props。
 * 這張表是手動維護的（無法從型別自動推導出「有意義」的示範資料），
 * 若新增組件卻忘記加，LivePreview 會用空物件渲染（多數組件仍可正常顯示預設值）。
 */
export const demoPropsById: Record<string, Record<string, unknown>> = {
  'button-button': { children: 'Continue', variant: 'primary' },
  'badge-badge': { children: 'In progress', tone: 'info', dot: true },
  'card-card': { children: 'Card content goes here.' },
  'card-card-header': { title: 'Team members', subtitle: '4 people in this workspace' },
  'input-input': { label: 'Email address', placeholder: 'you@example.com' },
  'avatar-avatar': { name: 'Jane Cooper' },
};
