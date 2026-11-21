'use client';

import React, { useEffect, useState } from 'react';
import { Conversation, ConversationMode } from '@/lib/types';
import {
  Bot,
  User,
  Clock,
  Play,
  MessageSquare,
  Mail,
  PanelRightClose,
  PanelRightOpen,
  CreditCard,
  Lock,
  PackageCheck,
  Loader2,
  X,
} from 'lucide-react';
import { get24HourWindowStatus } from '@/lib/whatsapp';

function formatCleanLanguage(code?: string | null): string {
  if (!code) return 'English';
  const c = code.trim().toLowerCase();
  if (c === 'roman urdu' || c === 'roman_urdu' || c === 'ur-latn') return 'Roman Urdu';
  if (c === 'en' || c === 'english') return 'English';
  if (c === 'ur' || c === 'urdu') return 'Urdu';
  if (c === 'ar' || c === 'arabic') return 'Arabic';
  if (c === 'zh' || c === 'chinese') return 'Chinese';
  return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase();
}

interface UnifiedChatHeaderProps {
  conversation: Conversation;
  /** Pausing by hand sends the owner's password. Throws on error (shown in the popup). */
  onModeChange: (mode: ConversationMode, password?: string) => Promise<void>;
  /** Called after "Verify payment" succeeded (reload the chat). */
  onPaymentVerified?: () => Promise<void>;
  onTriggerAiNow?: () => Promise<void>;
  onTogglePanel?: () => void;
  isPanelOpen?: boolean;
  /** View-only users see the AI status but cannot pause / resume. */
  canToggleAi?: boolean;
}

export function UnifiedChatHeader({
  conversation,
  onModeChange,
  onTriggerAiNow,
  onPaymentVerified,
  onTogglePanel,
  isPanelOpen = true,
  canToggleAi = true,
}: UnifiedChatHeaderProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [confirm, setConfirm] = useState<null | 'pause' | 'payment' | 'delivery'>(null);
  const [deliveries, setDeliveries] = useState<SupplierOrder[]>([]);
  const [deliveryPick, setDeliveryPick] = useState('');
  const [order, setOrder] = useState<PendingOrder | null>(null);
  const contact = conversation.contact;
  const isEmail = conversation.channel === 'email';
  const isSupplier = contact?.kind === 'supplier';
  const displayName = contact?.name || (isEmail ? contact?.email : `+${contact?.wa_id}`);
  const aiOn = conversation.mode === 'ai';

  const windowStatus = get24HourWindowStatus(conversation.last_customer_message_at);

  // The customer's current unpaid order (for the Verify payment button).
  useEffect(() => {
    let live = true;
    setOrder(null);
    if (!canToggleAi || isSupplier) return;
    fetch(`/api/conversations/${conversation.id}/payment`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setOrder(d?.order || null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [conversation.id, conversation.mode, canToggleAi, isSupplier]);

  // Supplier orders waiting for delivery (for the Order delivered button).
  useEffect(() => {
    let live = true;
    setDeliveries([]);
    if (!canToggleAi || !isSupplier) return;
    fetch(`/api/conversations/${conversation.id}/delivery`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live) return;
        setDeliveries(d?.orders || []);
        setDeliveryPick(d?.orders?.[0]?.request_id || '');
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [conversation.id, canToggleAi, isSupplier, confirm]);

  // One click: Human → AI right away. AI → Human asks the owner's password first (a manual pause stays until the owner resumes).
  const handleSwitch = async () => {
    if (aiOn) return setConfirm('pause');
    setIsUpdating(true);
    try {
      await onModeChange('ai');
    } catch (e: any) {
      alert(e?.message || 'Could not turn the AI on');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="border-b border-slate-200/80 bg-white px-3 md:px-5 py-2 md:py-3 shrink-0">
      <div className="flex md:flex-wrap items-center justify-between gap-2">
        {/* Contact info & Channel Tag */}
        <div className="flex items-center space-x-2.5 md:space-x-3.5 min-w-0 flex-1">
          <div className="relative shrink-0">
            <div
              className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-xs uppercase shadow-xs ${
                isEmail ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-800'
              }`}
            >
              {displayName?.substring(0, 2) || 'PB'}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center text-white text-[8px] ${
                isEmail ? 'bg-blue-600' : 'bg-orange-600'
              }`}
            >
              {isEmail ? <Mail className="w-2 h-2" /> : <MessageSquare className="w-2 h-2" />}
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight truncate max-w-[10rem] md:max-w-none">{displayName}</h2>
              {contact?.country && (
                <span className="hidden md:inline text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium border border-slate-200/60">
                  {contact.country}
                </span>
              )}
            </div>
            <div className="flex md:flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5 md:mt-1 min-w-0">
              <span className="font-mono text-slate-600 font-medium truncate">
                {isEmail ? contact?.email : `+${contact?.wa_id}`}
              </span>
              <span className="hidden md:inline text-slate-300">·</span>
              <span className="hidden md:inline-flex items-center gap-1 font-medium text-slate-700 bg-slate-50 border border-slate-200/80 px-2 py-0.5 rounded-full">
                <span className="text-slate-400 font-normal">Language:</span>
                <span className="font-semibold text-slate-800">{formatCleanLanguage(contact?.preferred_language)}</span>
              </span>
              {contact?.lead_status && (
                <span className="hidden md:contents">
                  <span className="text-slate-300">·</span>
                  <span className="text-orange-600 font-semibold bg-orange-50 border border-orange-200/80 px-2 py-0.5 rounded-full">
                    {contact.lead_status}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls & AI Takeover Toggle */}
        <div className="flex items-center gap-1.5 md:gap-3 shrink-0 md:flex-wrap">
          {/* 24-hour Meta Window for WhatsApp */}
          {!isEmail && (
            <div
              className={`hidden md:flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 rounded-full text-[10px] md:text-[11px] font-medium whitespace-nowrap transition-all ${
                windowStatus.isOpen
                  ? 'bg-orange-50 text-orange-700 border border-orange-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
              title="Meta Cloud API 24-Hour Messaging Window"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{windowStatus.remainingFormatted.replace(/\s*left$/i, '')}<span className="hidden md:inline">{/left$/i.test(windowStatus.remainingFormatted) ? ' left' : ''}</span></span>
            </div>
          )}

          {!canToggleAi && (
            <span className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${aiOn ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
              {aiOn ? 'AI Responding' : 'Human Responding'}
            </span>
          )}

          {/* Verify payment of the current order (owner's password) */}
          {canToggleAi && !isSupplier && (
            <button
              disabled={isUpdating}
              onClick={() => setConfirm('payment')}
              aria-label="Verify payment"
              className="p-2 md:px-3 md:py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs transition-all"
              title={order ? `Mark ${order.order_no} as paid, turn the AI back on and thank the customer` : 'No unpaid order for this customer yet'}
            >
              <CreditCard className="w-4 h-4 md:w-3.5 md:h-3.5" />
              <span className="hidden md:inline">{order ? `Verify payment · ${order.order_no}` : 'Verify payment'}</span>
            </button>
          )}

          {/* Supplier delivered the order: stock into Inventory, thank the supplier, follow up the customer */}
          {canToggleAi && isSupplier && (
            <button
              disabled={isUpdating}
              onClick={() => setConfirm('delivery')}
              aria-label="Order delivered"
              className="p-2 md:px-3 md:py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs transition-all"
              title={deliveries.length ? 'Mark the order delivered: Inventory is updated, the supplier is thanked and the customer gets a follow-up' : 'No order waiting for delivery from this supplier'}
            >
              <PackageCheck className="w-4 h-4 md:w-3.5 md:h-3.5" />
              <span className="hidden md:inline">{deliveries.length === 1 ? `Order delivered · ${deliveries[0].request_id}` : 'Order delivered'}</span>
            </button>
          )}

          {/* One-click switch: AI Responding ⇄ Human Responding */}
          {canToggleAi && (
            <button
              disabled={isUpdating}
              onClick={handleSwitch}
              role="switch"
              aria-checked={aiOn}
              title={aiOn ? "Pause the AI for this chat (owner's password)" : 'Turn the AI back on for this chat'}
              className={`px-2 md:px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 md:gap-2 whitespace-nowrap shadow-xs transition-all disabled:opacity-60 ${
                aiOn ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
            >
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : aiOn ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              <span className="md:hidden">{aiOn ? 'AI' : 'Human'}</span>
              <span className="hidden md:inline">{aiOn ? 'AI Responding' : 'Human Responding'}</span>
              <span className={`relative md:ml-1 w-7 h-4 rounded-full ${aiOn ? 'bg-white/35' : 'bg-black/15'}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${aiOn ? 'left-3.5' : 'left-0.5'}`} />
              </span>
            </button>
          )}

          {/* Toggle Right Panel Button */}
          {onTogglePanel && (
            <button
              onClick={onTogglePanel}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title={isPanelOpen ? 'Collapse customer panel' : 'Expand customer panel'}
            >
              {isPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {!aiOn && (
        <div className="mt-2 md:mt-2.5 px-3 md:px-3.5 py-1.5 md:py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] md:text-xs text-amber-900">
          <strong>Human Responding:</strong>{' '}
          {conversation.mode === 'handoff'
            ? 'handed over to sales automatically, the AI is paused.'
            : 'the AI is paused by hand and stays paused until you turn it back on.'}{' '}
          <span className="hidden md:inline">Reply below, it is translated to the {isSupplier ? 'supplier' : 'customer'}&apos;s language.</span>
        </div>
      )}

      {confirm === 'pause' && (
        <PasswordDialog
          title="Pause the AI for this chat?"
          text={`${displayName} will get no AI replies until you turn the AI back on. Automatic changes will not undo this.`}
          confirmLabel="Pause AI"
          onClose={() => setConfirm(null)}
          onConfirm={async (password) => {
            await onModeChange('human', password);
            setConfirm(null);
          }}
        />
      )}
      {confirm === 'delivery' && !deliveries.length && (
        <InfoDialog
          title="No order waiting for delivery"
          text={`${displayName} has no order waiting for delivery. An order waits for delivery after you select this supplier's quote.`}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'delivery' && deliveries.length > 0 && (
        <PasswordDialog
          title="Order delivered?"
          text={`Same as writing "DELIVERED ${deliveryPick}" on WhatsApp: the stock is added to Inventory, ${displayName} is thanked in their language and the customer who asked for it gets a follow-up.`}
          details={
            <div className="space-y-1.5">
              {deliveries.map((d) => (
                <label key={d.request_id} className={`flex gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer ${deliveryPick === d.request_id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <input type="radio" name="delivery" className="mt-0.5" checked={deliveryPick === d.request_id} onChange={() => setDeliveryPick(d.request_id)} />
                  <span className="min-w-0">
                    <span className="font-semibold text-slate-800">{d.request_id}</span>
                    <span className="block text-slate-600 truncate">{d.product || '-'}</span>
                    <span className="block text-slate-500">
                      {d.quantity ? `${d.quantity} pcs` : ''}
                      {d.price ? ` · ${d.currency} ${d.price} each` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          }
          confirmLabel="Confirm delivery"
          tone="green"
          onClose={() => setConfirm(null)}
          onConfirm={async (password) => {
            const res = await fetch(`/api/conversations/${conversation.id}/delivery`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ request_id: deliveryPick, password }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
            setConfirm(null);
            await onPaymentVerified?.();
          }}
        />
      )}
      {confirm === 'payment' && !order && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && setConfirm(null)}>
          <div role="dialog" aria-modal="true" aria-label="No unpaid order" className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">No unpaid order</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {displayName} has no order waiting for payment yet. When the AI confirms an order (ORD-…) for this customer, it shows here and you can verify its payment.
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={() => setConfirm(null)} className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-900">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {confirm === 'payment' && order && (
        <PasswordDialog
          title={`Verify payment for ${order.order_no}?`}
          text={`Same as sending "PAYMENT VERIFIED ${order.order_no}" on WhatsApp: the order is marked paid, the AI is turned back on and ${displayName} gets the thank-you-for-payment message.`}
          details={
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-0.5">
              <div className="flex justify-between gap-3">
                <span className="font-semibold">{order.order_no}</span>
                <span className="font-semibold">{order.currency} {Number(order.total || 0).toLocaleString()}</span>
              </div>
              <div className="text-slate-500">Status: {order.status} · Payment: {order.payment_status}</div>
              {order.items.map((i) => (
                <div key={i} className="truncate">{i}</div>
              ))}
            </div>
          }
          confirmLabel="Verify payment"
          tone="green"
          onClose={() => setConfirm(null)}
          onConfirm={async (password) => {
            const res = await fetch(`/api/conversations/${conversation.id}/payment`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ order_id: order.id, password }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
            setConfirm(null);
            setOrder(null);
            await onPaymentVerified?.();
          }}
        />
      )}
    </div>
  );
}

interface SupplierOrder {
  request_id: string;
  supplier_id: string;
  product: string;
  quantity: string;
  price: string;
  currency: string;
  status: string;
}

function InfoDialog({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-600 leading-relaxed">{text}</p>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-900">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

interface PendingOrder {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  total: number;
  currency: string;
  items: string[];
}

/** Confirm popup that asks for the owner's password. */
function PasswordDialog({
  title,
  text,
  details,
  confirmLabel,
  tone = 'amber',
  onClose,
  onConfirm,
}: {
  title: string;
  text: string;
  details?: React.ReactNode;
  confirmLabel: string;
  tone?: 'amber' | 'green';
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return setError("Enter the owner's password");
    setBusy(true);
    setError('');
    try {
      await onConfirm(password);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Cancel" className="p-1 -m-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">{text}</p>
        {details}
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Password
          </span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Enter password to confirm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </label>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="px-3 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg text-white flex items-center gap-1.5 disabled:opacity-60 ${tone === 'green' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600'}`}
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
