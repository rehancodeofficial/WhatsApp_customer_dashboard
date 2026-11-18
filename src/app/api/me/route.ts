import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { isDemoMode, canSendRealWhatsApp } from '@/lib/config';
import { can, roleLabel, type Permission } from '@/lib/permissions';

const ALL: Permission[] = ['chats.view', 'chats.reply', 'ai.toggle', 'chats.organize', 'customers.view', 'payments.manage', 'stats.view', 'staff.manage', 'settings.view'];

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.json({
    viewer: { ...viewer, roleLabel: roleLabel(viewer.role) },
    permissions: ALL.filter((p) => can(viewer.role, p)),
    demo: isDemoMode(),
    whatsappLive: canSendRealWhatsApp(),
  });
}
