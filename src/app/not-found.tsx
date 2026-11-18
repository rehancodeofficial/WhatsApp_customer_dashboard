import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-slate-50 text-slate-700">
      <h1 className="text-lg font-bold">Page not found</h1>
      <Link href="/dashboard" className="text-sm text-emerald-700 underline">
        Back to the inbox
      </Link>
    </div>
  );
}
