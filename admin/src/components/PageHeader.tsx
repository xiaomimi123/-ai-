import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon: Icon,
  actions,
}) => {
  return (
    <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {Icon && <Icon size={24} color="var(--accent)" />}
        <div style={{ minWidth: 0 }}>
          <h2 className="page-title" style={{ margin: 0 }}>{title}</h2>
          {description && <p className="page-desc" style={{ margin: '4px 0 0' }}>{description}</p>}
        </div>
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
};
