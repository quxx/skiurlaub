import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'text' | 'danger';
  busy?: boolean;
  static?: boolean;
};

export function Button({
  variant = 'secondary',
  busy = false,
  static: isStatic = false,
  className = '',
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`button button--${variant} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-static={isStatic || undefined}
    >
      {children}
    </button>
  );
}
