'use client';

import { useHeaderModel } from '@/components/header/useHeaderModel';
import { HeaderActions, HeaderContextControls, HeaderCreateOrganization } from '@/components/header/HeaderParts';

type TopHeaderProps = {
  onOpenNav: () => void;
};

/**
 * The current header. Feature 030 split it into `useHeaderModel` + composable
 * parts (unchanged markup) so the Studio 2.0 shell can reuse the same controls.
 */
export function TopHeader({ onOpenNav }: TopHeaderProps) {
  const m = useHeaderModel();
  const { productEnv } = m;
  return (
    <header
      className={`sticky top-0 min-h-[72px] flex flex-wrap justify-between items-center gap-y-2 px-4 sm:px-gutter py-2 z-30 border-b transition-colors duration-200 ${
        productEnv ? `${productEnv.headerTint} ${productEnv.headerBorder}` : 'bg-surface border-outline-variant'
      }`}
    >
      {/* Product environment strip — a thin accent in the current product's colour (absolute: no layout shift). */}
      {productEnv && <span className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] ${productEnv.bar}`} aria-hidden="true" />}
      <HeaderContextControls m={m} onOpenNav={onOpenNav} />

      <HeaderActions m={m} />

      <HeaderCreateOrganization m={m} />
    </header>
  );
}
