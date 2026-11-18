import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { isDemoMode, canSendRealWhatsApp } from '@/lib/config';

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.json({ viewer, demo: isDemoMode(), whatsappLive: canSendRealWhatsApp() });
}
