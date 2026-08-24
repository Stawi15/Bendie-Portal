type AvatarProps = {
  name: string | null | undefined;
  email?: string | null;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
};

export function Avatar({ name, email, avatarUrl, size = 32, className = '' }: AvatarProps) {
  const initial = (name ?? email ?? '?').trim()[0]?.toUpperCase() ?? '?';
  const style = { width: size, height: size };

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name ?? email ?? ''}
        style={style}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      style={style}
      className={`rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0 ${className}`}
    >
      <span style={{ fontSize: size * 0.4 }}>{initial}</span>
    </div>
  );
}
