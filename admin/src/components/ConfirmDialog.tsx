import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}) => {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  const isDanger = confirmVariant === 'danger';

  return (
    <div
      className="modal-overlay"
      onClick={() => !loading && onCancel()}
      style={{ zIndex: 'var(--z-modal-backdrop)' as any }}
    >
      <div
        className="modal modal-sm"
        onClick={e => e.stopPropagation()}
        style={{ zIndex: 'var(--z-modal)' as any }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{
            background: isDanger ? 'var(--danger-bg)' : 'var(--accent-light)',
            padding: 8,
            borderRadius: 6,
            display: 'flex',
          }}>
            <AlertTriangle size={20} color={isDanger ? 'var(--danger)' : 'var(--accent)'} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="modal-title" style={{ margin: 0, fontSize: 16, color: isDanger ? 'var(--danger-text)' : 'var(--text)' }}>
              {title}
            </h3>
            {description && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                {description}
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            className="btn btn-outline"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            className={isDanger ? 'btn' : 'btn btn-primary'}
            style={isDanger ? { background: 'var(--danger)', color: 'white', border: 'none' } : undefined}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
