'use client';

import { useState } from 'react';

type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
};

/** Free-text tag list for a `text[]` column — add via Enter/"Add", remove via the × on each pill. */
export function TagInput({ value, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const val = input.trim();
    if (!val || value.includes(val)) { setInput(''); return; }
    onChange([...value, val]);
    setInput('');
  };
  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder={placeholder}
        />
        <button type="button" onClick={addTag} className="btn-secondary text-xs flex-shrink-0">Add</button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {value.map((tag) => (
            <span key={tag} className="flex items-center gap-1 bg-primary/5 border border-primary/20 rounded-full px-3 py-1">
              <span className="text-sm text-primary">{tag}</span>
              <button type="button" onClick={() => removeTag(tag)} className="text-primary/60 hover:text-error ml-1 font-bold leading-none transition">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
