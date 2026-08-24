import { SectionIconBadge } from './SectionIconBadge';
import { getSectionMeta } from '@/lib/eventSectionMeta';

type SectionHeaderProps = {
  sectionKey: string;
  /** Overrides the default static description with dynamic page content (e.g. a live count). */
  desc?: React.ReactNode;
};

export function SectionHeader({ sectionKey, desc }: SectionHeaderProps) {
  const meta = getSectionMeta(sectionKey);

  return (
    <div className="flex items-start gap-4">
      {meta && <SectionIconBadge icon={meta.icon} bg={meta.badgeBg} fg={meta.badgeFg} />}
      <div className="min-w-0">
        <h1 className="font-headline-md text-headline-md text-on-surface">{meta?.label ?? sectionKey}</h1>
        <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">{desc ?? meta?.desc}</p>
      </div>
    </div>
  );
}
