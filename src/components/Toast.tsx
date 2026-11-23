import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-[120] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 rounded-lg border bg-white shadow-lg text-sm transition-all',
            toast.type === 'success' && 'border-emerald-200 text-slate-800',
            toast.type === 'error' && 'border-red-200 text-slate-800',
            toast.type === 'info' && 'border-slate-200 text-slate-800'
          )}
        >
          {toast.type === 'success' && (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
          )}
          {toast.type === 'error' && (
            <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          )}
          {toast.type === 'info' && (
            <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
          )}
          <span className="flex-1 leading-snug text-xs font-medium text-slate-700">
            {toast.message}
          </span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
