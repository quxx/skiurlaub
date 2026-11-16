import type { LucideIcon } from 'lucide-react';

type IconTileProps = {
  icon: LucideIcon;
  tone?: 'cyan' | 'blue' | 'turquoise' | 'violet';
};

const toneClasses = {
  cyan: 'bg-glacier-400/10 text-glacier-300',
  blue: 'bg-sky-400/10 text-sky-300',
  turquoise: 'bg-turquoise-400/10 text-turquoise-300',
  violet: 'bg-violet-400/10 text-violet-300',
} as const;

export function IconTile({ icon: Icon, tone = 'cyan' }: IconTileProps) {
  return (
    <span
      className={`grid size-11 shrink-0 place-items-center rounded-[0.9rem] ${toneClasses[tone]}`}
      aria-hidden="true"
    >
      <Icon size={21} strokeWidth={1.7} />
    </span>
  );
}
