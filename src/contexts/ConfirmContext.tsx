'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

type PendingConfirm = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    const normalized = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setPending({ options: normalized, resolve });
    });
  }, []);

  const settle = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[20px] panel-shadow p-6 w-full max-w-sm">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2">
              {pending.options.title ?? 'Please confirm'}
            </h2>
            <p className="text-sm text-on-surface-variant whitespace-pre-line">{pending.options.message}</p>
            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-secondary" onClick={() => settle(false)}>
                {pending.options.cancelLabel ?? 'Cancel'}
              </button>
              <button
                className={pending.options.destructive ? 'btn-danger' : 'btn-primary'}
                onClick={() => settle(true)}
              >
                {pending.options.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
