'use client';

type ImageFieldProps = {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  onBrowse?: () => void;
  compact?: boolean;
};

export function ImageField({ label, hint, value, onChange, onBrowse, compact }: ImageFieldProps) {
  return (
    <div className="min-w-0">
      {label && <label className="label">{label}</label>}
      <div className="flex gap-2">
        <input className={`input flex-1 ${compact ? 'text-sm' : ''}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://..." />
        {onBrowse && (
          <button type="button" className="btn-secondary flex-shrink-0 flex items-center gap-1.5 text-xs" onClick={onBrowse}>
            <span className="material-symbols-outlined text-sm">photo_library</span>
            Browse Assets
          </button>
        )}
      </div>
      {hint && <p className="hint">{hint}</p>}
      {value && (
        <div className={`mt-2 rounded-xl overflow-hidden border border-outline-variant bg-surface-container-low flex items-center justify-center ${compact ? 'h-20' : 'h-36'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label || 'Preview'} className="max-h-full max-w-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}
    </div>
  );
}
