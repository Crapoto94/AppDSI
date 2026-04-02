import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, HelpCircle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  type: 'info' | 'confirm' | 'prompt' | 'error' | 'success';
  title: string;
  message: string;
  defaultValue?: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  type,
  title,
  message,
  defaultValue = '',
  onConfirm,
  onCancel,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  placeholder = ''
}) => {
  const [inputValue, setInputValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setInputValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle2 size={48} color="#22c55e" />;
      case 'error': return <AlertTriangle size={48} color="#ef4444" />;
      case 'confirm': return <HelpCircle size={48} color="#0078a4" />;
      case 'prompt': return <Info size={48} color="#0078a4" />;
      default: return <Info size={48} color="#0078a4" />;
    }
  };

  const getHeaderColor = () => {
    switch (type) {
      case 'success': return '#f0fdf4';
      case 'error': return '#fef2f2';
      default: return '#f0f9ff';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.6)',
      backdropFilter: 'blur(4px)',
      zIndex: 3000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        background: 'white',
        maxWidth: '500px',
        width: '100%',
        borderRadius: '24px',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        position: 'relative',
        transform: 'scale(1)',
        animation: 'zoomIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }} onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={onCancel}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: '#f1f5f9',
            border: 'none',
            cursor: 'pointer',
            color: '#64748b',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
          }}
        >
          <X size={18} />
        </button>

        <div style={{
          padding: '40px 30px',
          textAlign: 'center',
          background: getHeaderColor()
        }}>
          <div style={{ marginBottom: '20px', display: 'inline-block' }}>
            {getIcon()}
          </div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>
            {title}
          </h2>
        </div>

        <div style={{ padding: '30px' }}>
          <p style={{ 
            color: '#64748b', 
            fontSize: '1rem', 
            marginTop: 0, 
            marginBottom: type === 'prompt' ? '15px' : '30px', 
            lineHeight: '1.6',
            textAlign: 'center'
          }}>
            {message}
          </p>

          {type === 'prompt' && (
            <input 
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={placeholder}
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                fontSize: '1rem',
                outline: 'none',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                marginBottom: '25px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirm(inputValue);
                if (e.key === 'Escape') onCancel();
              }}
            />
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            {(type === 'confirm' || type === 'prompt') && (
              <button 
                onClick={onCancel}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {cancelLabel}
              </button>
            )}
            <button 
              onClick={() => onConfirm(type === 'prompt' ? inputValue : undefined)}
              style={{
                flex: 1,
                padding: '12px',
                background: type === 'error' ? '#ef4444' : '#0078a4',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes zoomIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default ConfirmationModal;
