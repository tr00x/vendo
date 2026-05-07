'use client';

import { Toaster as SonnerToaster } from 'sonner';
import { CheckCircleIcon, AlertCircleIcon, InfoIcon } from './icons';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      offset={20}
      closeButton
      icons={{
        success: <CheckCircleIcon className="h-5 w-5 text-emerald-500" />,
        error: <AlertCircleIcon className="h-5 w-5 text-red-500" />,
        info: <InfoIcon className="h-5 w-5 text-sky-500" />,
      }}
      toastOptions={{
        style: {
          background: 'white',
          border: '1px solid #e5e7eb',
          fontSize: '14px',
        },
      }}
    />
  );
}
