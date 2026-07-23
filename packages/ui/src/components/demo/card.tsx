import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@workspace/ui/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a hover elevation effect, useful for clickable cards */
  interactive?: boolean;
  /** Internal padding in pixels */
  padding?: number;
  /** Card content */
  children: ReactNode;
}

/** A container for grouping related content with consistent padding and border. */
export function Card({ interactive = false, padding = 20, children, className, style, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground transition-[border-color,transform] duration-150 ease-out',
        interactive && 'cursor-pointer hover:-translate-y-0.5 hover:border-primary',
        className
      )}
      style={{ padding, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  /** Main heading text */
  title: string;
  /** Optional supporting text below the title */
  subtitle?: string;
}

/** Header region for a Card, rendering a title and optional subtitle. */
export function CardHeader({ title, subtitle }: CardHeaderProps) {
  return (
    <div className="mb-3">
      <h3 className="m-0 text-base font-bold text-card-foreground">{title}</h3>
      {subtitle && <p className="m-0 mt-1 text-[0.8125rem] text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
