type SectionIconBadgeProps = {
  icon: string;
  bg: string;
  fg: string;
  size?: number;
};

export function SectionIconBadge({ icon, bg, fg, size = 44 }: SectionIconBadgeProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl flex-shrink-0 ${bg} ${fg}`}
      style={{ width: size, height: size }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: size * 0.5 }}>
        {icon}
      </span>
    </div>
  );
}
