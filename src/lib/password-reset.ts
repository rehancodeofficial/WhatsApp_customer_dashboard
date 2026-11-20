import { randomUUID } from 'crypto';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { listStaff, updateStaff, StaffError } from '@/lib/staff';
import { findOwnerByEmail, maskEmail, RESET_MINUTES, sendOwnerResetLink } from '@/lib/owner-reset';

export interface PasswordResetRequest {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  reason?: string | null;
  verification_notes?: string | null;
  temporary_password?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

// In-memory store fallback (used in Demo mode or when DB table has not been migrated yet)
const g = globalThis as unknown as { __pbResetRequests?: PasswordResetRequest[] };

function getMemoryStore(): PasswordResetRequest[] {
  if (!g.__pbResetRequests) {
    g.__pbResetRequests = [];
  }
  return g.__pbResetRequests;
}

export async function requestPasswordReset(emailInput: string, reason?: string, origin = ''): Promise<{
  type: 'admin_email_sent' | 'staff_request_submitted';
  message: string;
  email: string;
}> {
  const email = emailInput.trim().toLowerCase();

  // Owner: a one-time link (15 minutes) goes to the recovery email (Outlook). Matches the login or the recovery email.
  if (!isDemoMode()) {
    const owner = await findOwnerByEmail(email);
    if (owner) {
      const sent = await sendOwnerResetLink(owner, origin).catch((e) => {
        throw new StaffError(e?.message || 'Could not send the reset email.', 502);
      });
      return {
        type: 'admin_email_sent',
        message: `A reset link was sent to ${maskEmail(sent.sentTo)}. It works once and expires in ${RESET_MINUTES} minutes.`,
        email: maskEmail(sent.sentTo),
      };
    }
  }

  const staffList = await listStaff();
  const user = staffList.find((u) => u.email.toLowerCase() === email);

  if (!user || !user.active) {
    throw new StaffError('No active account found with this email address.', 404);
  }

  // 1. If user is Admin ('owner'), trigger direct email password recovery
  if (user.role === 'owner') {
    if (isDemoMode()) {
      return {
        type: 'admin_email_sent',
        message: 'Password reset link sent to admin email (Demo Mode).',
        email: user.email,
      };
    }

    // Live mode never gets here: the owner is handled above.
    throw new StaffError('Password reset for the Admin is not available.', 500);
  }

  // 2. If user is Staff / non-admin ('agent'), create a reset request for Admin review
  const reqObj: PasswordResetRequest = {
    id: randomUUID(),
    user_id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    status: 'pending',
    reason: reason?.trim() || null,
    verification_notes: null,
    temporary_password: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!isDemoMode()) {
    try {
      const sb = getAdminSupabase();
      const { data, error } = await sb
        .from('password_reset_requests')
        .insert({
          id: reqObj.id,
          user_id: reqObj.user_id,
          email: reqObj.email,
          full_name: reqObj.full_name,
          role: reqObj.role,
          status: 'pending',
          reason: reqObj.reason,
        })
        .select()
        .single();

      if (!error && data) {
        return {
          type: 'staff_request_submitted',
          message: 'Your password reset request has been forwarded to the Admin for identity verification.',
          email: user.email,
        };
      }
    } catch {
      // Table might not exist yet; gracefully fallback to in-memory store
    }
  }

  // In-memory fallback
  const store = getMemoryStore();
  // Filter out any older pending requests for the same user
  const idx = store.findIndex((r) => r.user_id === user.id && r.status === 'pending');
  if (idx >= 0) {
    store[idx] = reqObj;
  } else {
    store.unshift(reqObj);
  }

  return {
    type: 'staff_request_submitted',
    message: 'Your password reset request has been forwarded to the Admin for identity verification.',
    email: user.email,
  };
}

export async function listPasswordResetRequests(): Promise<PasswordResetRequest[]> {
  if (!isDemoMode()) {
    try {
      const sb = getAdminSupabase();
      const { data, error } = await sb
        .from('password_reset_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        return data as PasswordResetRequest[];
      }
    } catch {
      // Fallback to memory
    }
  }
  return [...getMemoryStore()];
}

export async function fulfillPasswordResetRequest(
  actorId: string,
  requestId: string,
  newPassword: string,
  verificationNotes?: string
): Promise<{ request: PasswordResetRequest; newPassword: string }> {
  if (newPassword.length < 8) {
    throw new StaffError('Password must be at least 8 characters long.', 400);
  }

  // Find request
  let reqItem: PasswordResetRequest | null = null;
  const store = getMemoryStore();

  if (!isDemoMode()) {
    try {
      const sb = getAdminSupabase();
      const { data } = await sb
        .from('password_reset_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();
      if (data) reqItem = data as PasswordResetRequest;
    } catch {}
  }

  if (!reqItem) {
    reqItem = store.find((r) => r.id === requestId) || null;
  }

  if (!reqItem) {
    throw new StaffError('Reset request not found.', 404);
  }

  // Update user's password using the updateStaff function
  await updateStaff(actorId, reqItem.user_id, { password: newPassword });

  const now = new Date().toISOString();
  const updatedReq: PasswordResetRequest = {
    ...reqItem,
    status: 'completed',
    temporary_password: newPassword,
    verification_notes: verificationNotes?.trim() || 'Verified by Admin',
    reviewed_by: actorId,
    reviewed_at: now,
    updated_at: now,
  };

  if (!isDemoMode()) {
    try {
      const sb = getAdminSupabase();
      await sb
        .from('password_reset_requests')
        .update({
          status: 'completed',
          // Never stored in plain text: the encrypted copy is in staff_secrets (Team & Access → Security).
          temporary_password: null,
          verification_notes: updatedReq.verification_notes,
          reviewed_by: actorId,
          reviewed_at: now,
          updated_at: now,
        })
        .eq('id', requestId);
    } catch {}
  }

  const memIdx = store.findIndex((r) => r.id === requestId);
  if (memIdx >= 0) {
    store[memIdx] = updatedReq;
  } else {
    store.unshift(updatedReq);
  }

  return { request: updatedReq, newPassword };
}
