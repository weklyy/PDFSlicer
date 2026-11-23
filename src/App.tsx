/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { Languages, Images, FileStack, Scissors } from 'lucide-react';
import { dictionaries, getDefaultLanguage, Language, languageNames } from './lib/i18n';
import { ImageToPdfWorkspace } from './components/ImageToPdfWorkspace';
import { ExtractPdfWorkspace } from './components/ExtractPdfWorkspace';
import { SlicePdfWorkspace } from './components/SlicePdfWorkspace';
import { ToastContainer, ToastMessage } from './components/Toast';
import { cn } from './lib/utils';

type WorkspaceMode = 'imageToPdf' | 'extract' | 'slice';

export default function App() {
  const [lang, setLang] = useState<Language>(() => getDefaultLanguage());
  const [mode, setMode] = useState<WorkspaceMode>('imageToPdf');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const t = dictionaries[lang] || dictionaries.zh;

  const notify = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const navItems: Array<{ key: WorkspaceMode; label: string; icon: typeof Images }> = [
    { key: 'imageToPdf', label: t.modeImageToPdf, icon: Images },
    { key: 'extract', label: t.modeExtract, icon: FileStack },
    { key: 'slice', label: t.modeSlice, icon: Scissors },
  ];

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-[#F4F5F7] text-slate-900 lg:overflow-hidden">
      {/* Top Bar: strict 3-zone contract */}
      <header className="h-14 px-4 sm:px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-4 sm:gap-8 shrink-0 z-30">
        {/* Zone 1: Single-line brand wordmark */}
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            className="text-blue-600 shrink-0"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
            <path d="M3 12H21" stroke="currentColor" strokeWidth="1.75" strokeDasharray="3 2" />
            <path d="M12 3V12" stroke="currentColor" strokeWidth="1.75" />
          </svg>
          <span className="text-[15px] font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            {t.appName}
          </span>
        </div>

        {/* Zone 2: Clean single-line mode navigation */}
        <nav
          aria-label="Workspace modes"
          className="flex items-center gap-4 sm:gap-7 h-full overflow-x-auto no-scrollbar"
        >
          {navItems.map(({ key, label, icon: Icon }) => {
            const active = mode === key;
            return (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={cn(
                  'h-full inline-flex items-center gap-1.5 border-b-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 px-0.5',
                  active
                    ? 'border-blue-600 text-slate-950 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                )}
              >
                <Icon size={15} className={active ? 'text-blue-600' : 'text-slate-400'} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Language Switcher */}
        <div className="flex items-center shrink-0">
          <label className="relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors cursor-pointer">
            <Languages size={14} className="text-slate-500 shrink-0" />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Language)}
              aria-label="Language"
              className="appearance-none bg-transparent outline-none cursor-pointer pr-4 text-xs font-medium text-slate-700 whitespace-nowrap"
            >
              {Object.entries(languageNames).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <svg
              width="9"
              height="5"
              viewBox="0 0 10 6"
              fill="none"
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <path
                d="M1 1L5 5L9 1"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </label>
        </div>
      </header>

      {/* Main Studio Area — keep all 3 workspaces mounted so switching modes preserves user files & edits */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className={mode === 'imageToPdf' ? 'flex-1 flex min-h-0' : 'hidden'}>
          <ImageToPdfWorkspace t={t} onNotify={notify} />
        </div>
        <div className={mode === 'extract' ? 'flex-1 flex min-h-0' : 'hidden'}>
          <ExtractPdfWorkspace t={t} onNotify={notify} />
        </div>
        <div className={mode === 'slice' ? 'flex-1 flex min-h-0' : 'hidden'}>
          <SlicePdfWorkspace t={t} onNotify={notify} />
        </div>
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
