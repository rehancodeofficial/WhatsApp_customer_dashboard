import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { isDemoMode, canSendRealWhatsApp } from '@/lib/config';
import { permissionsOf, roleLabel } from '@/lib/permissions';

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.json({
    viewer: { id: viewer.id, role: viewer.role, name: viewer.name, email: viewer.email, avatar_url: viewer.avatar_url ?? null, roleLabel: roleLabel(viewer.role, viewer.roleName) },
    permissions: permissionsOf(viewer),
    demo: isDemoMode(),
    whatsappLive: canSendRealWhatsApp(),
  });
}
