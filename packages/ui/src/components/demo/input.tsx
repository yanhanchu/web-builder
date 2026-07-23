import type { InputHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@workspace/ui/utils/utils';

const inputVariants = cva(
  "w-full rounded-lg border border-border bg-background font-sans text-foreground outline-none transition-colors duration-150 ease-out focus-visible:border-primary placeholder:text-muted-foreground",
  {
    variants: {
      size: {
        sm: 'px-2.5 py-1.5 text-[0.8125rem]',
        md: 'px-3 py-2 text-sm',
        lg: 'px-4 py-3 text-[0.9375rem]',
      },
      invalid: {
        true: 'border-destructive',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      invalid: false,
    },
  }
);

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    Omit<VariantProps<typeof inputVariants>, 'invalid'> {
  /** Label displayed above the input */
  label?: string;
  /** Error message; when set, the input is styled as invalid */
  error?: string;
  /** Helper text displayed below the input when there is no error */
  helperText?: string;
  /** Visual size of the input */
  size?: 'sm' | 'md' | 'lg';
}

/** A labeled text input with built-in error and helper text states. */
export function Input({ label, error, helperText, size = 'md', id, className, ...rest }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5 font-sans">
      {label && (
        <label htmlFor={inputId} className="text-[0.8125rem] font-semibold text-muted-foreground">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(inputVariants({ size, invalid: Boolean(error) }), className)}
        aria-invalid={Boolean(error)}
        {...rest}
      />
      {error ? (
        <p className="m-0 text-xs text-destructive">{error}</p>
      ) : helperText ? (
        <p className="m-0 text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}
