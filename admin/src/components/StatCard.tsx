import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type StatCardColor = 'success' | 'warning' | 'danger' | 'info' | 'accent';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  color?: StatCardColor;
  hint?: string;
}

const COLOR_MAP: Record<StatCardColor, { fg: string; bg: string }> = {
  accent:  { fg: 'var(--accent)', bg: 'var(--accent-light)' },
  success: { fg: 'var(--accent)', bg: 'var(--accent-light)' },
  warning: { fg: 'var(--warning)', bg: 'var(--warning-bg)' },
  danger:  { fg: 'var(--danger)', bg: 'var(--danger-bg)' },
  info:    { fg: 'var(--info)', bg: 'var(--info-bg)' },
};

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, color = 'accent', hint }) => {
  const c = COLOR_MAP[color];
  return (
    <div className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: c.fg, lineHeight: 1.1 }}>{value}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{hint}</div>}
      </div>
      {Icon && (
        <div style={{
          background: c.bg,
          padding: 8,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icon size={18} color={c.fg} />
        </div>
      )}
    </div>
  );
};
