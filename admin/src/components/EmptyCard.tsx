import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

interface EmptyCardProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyCard: React.FC<EmptyCardProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
}) => {
  return (
    <div className="empty-card">
      <Icon size={32} color="var(--text-secondary)" />
      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, marginTop: 12 }}>{title}</div>
      {description && (
        <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{description}</div>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
};
