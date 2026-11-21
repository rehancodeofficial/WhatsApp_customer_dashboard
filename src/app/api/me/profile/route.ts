import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { requireCodeIfEnabled } from '@/lib/mfa';
import { logActivity } from '@/lib/security';
import { cleanPhone, demoSetAvatar, demoStaffRecord, StaffError, updateStaff } from '@/lib/staff';

// Settings → Profile: own name, photo and WhatsApp number (the same number the Admin sees in
// Team & Access), and (Admin only) the recovery email for password reset links.
export async function GET() {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (isDemoMode()) {
    const r = demoStaffRecord(v.id);
    return NextResponse.json({ name: v.name, role: v.role, recovery_email: null, whatsapp: r?.whatsapp ?? null, avatar_url: r?.avatar_url ?? null });
  }
  const { data } = await getAdminSupabase().from('profiles').select('full_name, recovery_email, username, whatsapp').eq('id', v.id).maybeSingle();
  return NextResponse.json({
    name: data?.full_name || v.name,
    username: data?.username ?? null,
    role: v.role,
    recovery_email: data?.recovery_email ?? null,
    whatsapp: data?.whatsapp ?? null,
    avatar_url: v.avatar_url ?? null,
  });
}

const AVATAR = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

const Body = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(120).optional(),
  recovery_email: z.union([z.string().trim().email('Enter a valid recovery email'), z.literal('')]).optional(),
  whatsapp: z
    .string()
    .trim()
    .max(30)
    .refine((s) => !s || /^\+?[0-9 ()-]{8,25}$/.test(s), 'Enter the number with country code, like +92 300 1234567')
    .optional(),
  /** New photo as a small data URL (resized in the browser), or "" to remove it. */
  avatar: z.union([z.string().max(1_400_000).regex(AVATAR, 'Use a JPG, PNG or WebP photo'), z.literal('')]).optional(),
  code: z.string().max(10).optional(),
});

export async function PATCH(req: NextRequest) {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message }, { status: 400 });
  // Two-factor on: any profile change needs a current authenticator code.
  if (!isDemoMode()) {
    const codeErr = await requireCodeIfEnabled(p.data.code);
    if (codeErr) return NextResponse.json({ error: codeErr, code_required: true }, { status: 403 });
  }
  if (p.data.recovery_email !== undefined && v.role !== 'owner') {
    return NextResponse.json({ error: 'Only the Admin has a recovery email' }, { status: 403 });
  }

  const fields: string[] = [];
  try {
    // Name and WhatsApp go through the staff record, so Team & Access shows the same values.
    const staff: { full_name?: string; whatsapp?: string | null } = {};
    if (p.data.name !== undefined) staff.full_name = p.data.name;
    if (p.data.whatsapp !== undefined) staff.whatsapp = p.data.whatsapp ? cleanPhone(p.data.whatsapp) : null;
    if (Object.keys(staff).length) {
      await updateStaff(v.id, v.id, staff);
      fields.push(...Object.keys(staff));
    }
    if (p.data.recovery_email !== undefined && !isDemoMode()) {
      const { error } = await getAdminSupabase().from('profiles').update({ recovery_email: p.data.recovery_email || null }).eq('id', v.id);
      if (error) throw new Error(error.message);
      fields.push('recovery_email');
    }
    let avatar_url: string | null | undefined;
    if (p.data.avatar !== undefined) {
      avatar_url = await saveAvatar(v.id, p.data.avatar);
      fields.push('avatar');
    }
    if (fields.length) await logActivity(v, 'profile.updated', { fields });
    return NextResponse.json({ success: true, ...(avatar_url !== undefined ? { avatar_url } : {}) });
  } catch (e: any) {
    const status = e instanceof StaffError ? e.status : 500;
    return NextResponse.json({ error: e.message || 'Could not save' }, { status });
  }
}

/** Stores the photo in the public "avatars" bucket and remembers its URL on the user. "" removes it. */
async function saveAvatar(userId: string, dataUrl: string): Promise<string | null> {
  if (isDemoMode()) {
    demoSetAvatar(userId, dataUrl || null);
    return dataUrl || null;
  }
  const db = getAdminSupabase();
  const path = `${userId}.jpg`;
  let url: string | null = null;
  if (dataUrl) {
    const m = dataUrl.match(AVATAR)!;
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > 1_000_000) throw new Error('Photo is too large (max 1 MB)');
    const { error } = await db.storage.from('avatars').upload(path, bytes, { contentType: `image/${m[1]}`, upsert: true, cacheControl: '3600' });
    if (error) throw new Error('Photo upload failed: ' + error.message);
    url = db.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
  } else {
    await db.storage.from('avatars').remove([path]);
  }
  const { data: u } = await db.auth.admin.getUserById(userId);
  const { error } = await db.auth.admin.updateUserById(userId, { user_metadata: { ...(u?.user?.user_metadata || {}), avatar_url: url } });
  if (error) throw new Error(error.message);
  return url;
}
