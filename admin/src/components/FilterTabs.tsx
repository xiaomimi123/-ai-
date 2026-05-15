import React from 'react';

interface FilterOption {
  label: string;
  value: string;
  count?: number;
}

interface FilterTabsProps {
  value: string;
  onChange: (v: string) => void;
  options: FilterOption[];
}

export const FilterTabs: React.FC<FilterTabsProps> = ({ value, onChange, options }) => {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            className={`filter-button ${active ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
            {opt.count != null && (
              <span style={{
                display: 'inline-block',
                marginLeft: 6,
                padding: '1px 6px',
                background: active ? 'rgba(255,255,255,0.3)' : 'var(--surface-2)',
                color: active ? 'white' : 'var(--text-secondary)',
                borderRadius: 10,
                fontSize: 11,
              }}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
