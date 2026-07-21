import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@workspace/ui/utils/utils';

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs font-semibold tracking-wide",
  {
    variants: {
      tone: {
        neutral: 'bg-secondary text-muted-foreground',
        success: 'bg-success/15 text-success',
        warning: 'bg-warning/15 text-warning',
        danger: 'bg-destructive/15 text-destructive',
        info: 'bg-info/15 text-info',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  }
);

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
  /** Semantic tone of the badge */
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  /** Renders a small dot indicator before the label */
  dot?: boolean;
  /** Badge content */
  children: ReactNode;
}

/** A compact label for statuses, counts, or tags. */
export function Badge({ tone = 'neutral', dot = false, children }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }))}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
