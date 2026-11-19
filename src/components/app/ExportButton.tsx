'use client';
import { Download } from 'lucide-react';

/** Downloads the records as an Excel file (.xlsx). */
export function ExportButton({ entity, label = 'Export Excel' }: { entity: string; label?: string }) {
  return (
    <a
      href={`/api/export/${entity}`}
      className="inline-flex items-center justify-center gap-2 rounded-full text-sm px-4 py-2.5 font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
      download
    >
      <Download className="w-4 h-4" /> {label}
    </a>
  );
}
