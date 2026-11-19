import { NextResponse } from 'next/server';
import { BizError } from './store';

export function bizError(e: any) {
  const status = e instanceof BizError ? e.status : typeof e?.status === 'number' ? e.status : 500;
  if (status >= 500) console.error('[biz]', e);
  return NextResponse.json({ error: e?.message || 'Something went wrong' }, { status });
}
