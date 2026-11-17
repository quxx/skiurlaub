import type { PropsWithChildren } from 'react';

type StatusBadgeProps = PropsWithChildren<{
  tone?: 'info' | 'warning' | 'muted' | 'success';
}>;

const toneClasses = {
  info: 'border-glacier-400/25 bg-glacier-400/10 text-glacier-200',
  warning: 'border-amber-300/25 bg-amber-300/10 text-amber-200',
  muted: 'border-ice-200/15 bg-ice-200/5 text-ice-200/65',
  success: 'border-turquoise-400/25 bg-turquoise-400/10 text-turquoise-200',
} as const;

export function StatusBadge({ children, tone = 'muted' }: StatusBadgeProps) {
  return (
    <span
      data-tone={tone}
      className={`status-badge inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
