import React from 'react';

interface FilterSidebarProps {
  width?: number;
  children: React.ReactNode;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({ width = 220, children }) => {
  return (
    <aside style={{
      width,
      minWidth: width,
      padding: 16,
      background: 'var(--surface-2)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      overflow: 'auto',
    }}>
      {children}
    </aside>
  );
};

interface FilterGroupProps {
  label: string;
  children: React.ReactNode;
}

export const FilterGroup: React.FC<FilterGroupProps> = ({ label, children }) => (
  <div>
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--text-secondary)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: 8,
    }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
  </div>
);
