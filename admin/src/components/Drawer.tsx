import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  open,
  title,
  onClose,
  width = 480,
  children,
}) => {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 1000,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s',
        }}
      />
      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width,
          maxWidth: '100vw',
          background: 'var(--surface)',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.1)',
          zIndex: 1001,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--surface-2)',
        }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              color: 'var(--text-secondary)',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>{children}</div>
      </div>
    </>
  );
};
