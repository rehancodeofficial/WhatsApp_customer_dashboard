import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/config';

export async function GET() {
  return NextResponse.json({ ok: true, demo: isDemoMode() });
}
