import type { LucideIcon } from 'lucide-react';
import type { PropsWithChildren, ReactNode } from 'react';

import { IconTile } from '@/components/ui/IconTile';

type DataCardProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  iconTone?: 'cyan' | 'blue' | 'turquoise' | 'violet';
  badge?: ReactNode;
  className?: string;
}>;

export function DataCard({
  title,
  subtitle,
  icon,
  iconTone,
  badge,
  className = '',
  children,
}: DataCardProps) {
  return (
    <article className={`glass-panel flex min-h-80 flex-col p-6 ${className}`}>
      <header className="flex min-h-14 items-start gap-3">
        <IconTile icon={icon} tone={iconTone} />
        <div className="min-w-0 pt-0.5">
          <h3 className="text-sm font-bold leading-5 text-ice-50">{title}</h3>
          {subtitle ? (
            <p className="mt-1 text-[0.625rem] tracking-[0.08em] text-ice-200/45 uppercase">
              {subtitle}
            </p>
          ) : null}
        </div>
        {badge ? <div className="ml-auto shrink-0 whitespace-nowrap">{badge}</div> : null}
      </header>
      {children}
    </article>
  );
}
