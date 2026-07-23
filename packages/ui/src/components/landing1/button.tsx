import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@workspace/ui/utils';


const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent font-semibold font-sans transition-[transform,background-color,border-color] duration-150 ease-out cursor-pointer active:not-disabled:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55",
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground border-border hover:border-primary',
        ghost: 'bg-transparent text-foreground hover:bg-secondary',
        danger: 'bg-destructive text-destructive-foreground hover:brightness-110',
      },
      size: {
        sm: 'px-3 py-1.5 text-[0.8125rem]',
        md: 'px-[1.125rem] py-2.5 text-sm',
        lg: 'px-6 py-3.5 text-[0.9375rem]',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Visual style of the button */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Size of the button */
  size?: 'sm' | 'md' | 'lg';
  /** Shows a loading spinner and disables interaction */
  isLoading?: boolean;
  /** Stretches the button to fill its container width */
  fullWidth?: boolean;
  /** Icon element rendered before the label */
  icon?: ReactNode;
  /** Button label / content */
  children: ReactNode;
}

/**
 * The primary interactive control for triggering actions.
 * Use `variant="danger"` for destructive actions like delete.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading ? (
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        icon
      )}
      <span>{children}</span>
    </button>
  );
}
