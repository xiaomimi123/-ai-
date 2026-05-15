import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  debounce?: number;       // ms; if set, auto-fires onSubmit after debounce
  clearable?: boolean;     // default true
  width?: number | string; // default 280
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = '搜索...',
  debounce,
  clearable = true,
  width = 280,
}) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focused, setFocused] = useState(false);

  // Debounced submit
  useEffect(() => {
    if (!debounce || !onSubmit) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSubmit(), debounce);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, debounce, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) {
      if (timerRef.current) clearTimeout(timerRef.current);
      onSubmit();
    }
  };

  const handleClear = () => {
    onChange('');
    if (onSubmit) onSubmit();
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', width }}>
      <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '8px 32px 8px 32px',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 13,
          background: 'var(--surface)',
          color: 'var(--text)',
          outline: 'none',
          borderColor: focused ? 'var(--accent)' : 'var(--border)',
          transition: 'border-color 0.15s',
        }}
      />
      {clearable && value && (
        <button
          onClick={handleClear}
          aria-label="清除"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            padding: 2,
            display: 'flex',
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
