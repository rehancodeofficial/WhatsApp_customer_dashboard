'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Mail, Megaphone, Send, Sparkles, Users } from 'lucide-react';
import type { Broadcast, BroadcastRecipient, PaymentTier } from '@/lib/biz/types';
import type { ProductSuggestion } from '@/lib/biz/logic';
import { ExportButton } from '../ExportButton';
import { api, Avatar, Button, Card, CardHeader, Chip, MultiSelect, SearchInput, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, money, num, PageHeader, PillTabs, StatusDot, Table, td, TierBadge } from '../ui';
import { contactLabel } from '@/lib/biz/channel';

interface BProduct { id: string; brand: string; model: string; variant: string | null; condition: string; grade?: string | null; location?: string | null; sale_price: number; currency: string; stock_qty: number }
interface Aud { id: string; name: string | null; wa_id: string; email?: string | null; channel?: 'whatsapp' | 'email'; country: string | null; tier: PaymentTier; brands: string[]; total_spent: number; windowOpen: boolean }
type Suggestion = ProductSuggestion & { aiNote?: string };

const pname = (p: BProduct) => `${p.brand} ${p.model}${p.variant ? ' ' + p.variant : ''}`.trim();

export function BroadcastView() {
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [products, setProducts] = useState<BProduct[]>([]);
  const [history, setHistory] = useState<Broadcast[] | null>(null);
  const [defaults, setDefaults] = useState({ template: '', lang: 'en', ai: false });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // composer state
  const [productIds, setProductIds] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [options, setOptions] = useState<{ countries: string[]; brands: string[] }>({ countries: [], brands: [] });
  const [audience, setAudience] = useState<Aud[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [offerPrice, setOfferPrice] = useState('');
  const [offerStock, setOfferStock] = useState('');
  const [template, setTemplate] = useState('');
  const [aiUsed, setAiUsed] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rq, setRq] = useState('');

  // suggestions
  const [sugg, setSugg] = useState<{ suggestions: Suggestion[]; source: string; error?: string } | null>(null);
  const [suggLoading, setSuggLoading] = useState(false);

  const loadList = useCallback(() => {
    api<{ broadcasts: Broadcast[]; products: BProduct[]; defaultTemplate: string; defaultTemplateLanguage: string; aiConfigured: boolean }>('/api/broadcasts')
      .then((d) => {
        setHistory(d.broadcasts);
        setProducts(d.products);
        setDefaults({ template: d.defaultTemplate, lang: d.defaultTemplateLanguage, ai: d.aiConfigured });
        setTemplate((t) => t || d.defaultTemplate);
      })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(loadList, [loadList]);

  // Re-query the audience whenever a filter changes.
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ customers: Aud[]; options: { countries: string[]; brands: string[] } }>('/api/broadcasts/audience', {
        method: 'POST',
        body: JSON.stringify({ countries, tiers, brands }),
      })
        .then((d) => {
          setAudience(d.customers);
          setOptions(d.options);
        })
        .catch((e) => setErr(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [countries, tiers, brands]);

  const getSuggestions = async () => {
    setSuggLoading(true);
    try {
      setSugg(await api('/api/broadcasts/suggestions'));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSuggLoading(false);
    }
  };

  const useSuggestion = (s: Suggestion) => {
    setProductIds([s.product_id]);
    setBrands(s.audience.brands || []);
    setTiers((s.audience.tiers as string[]) || []);
    setCountries(s.audience.countries || []);
    setTitle(`${s.product} offer`);
    setMessage(s.message);
    setAiUsed(true);
    setExcluded(new Set());
    setTab('new');
    document.getElementById('composer')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Default message when products are picked by hand or prices/stock/country change.
  const buildMessage = (picked: BProduct[], priceStr: string, stockStr: string, selectedCountries: string[]) => {
    if (!picked.length) return '';
    const loc = selectedCountries.length === 1 ? selectedCountries[0] : (picked[0].location || 'Dubai');
    return (
      `🔥 Special wholesale offer from Phone Buzz!\n\n` +
      picked
        .map((p, idx) => {
          const itemPrice = idx === 0 && priceStr ? priceStr : p.sale_price.toLocaleString();
          const itemStock = idx === 0 && stockStr ? stockStr : String(p.stock_qty);
          return `${pname(p)}\n${p.currency} ${itemPrice} per piece\n✅ ${itemStock} units ready in ${loc}`;
        })
        .join('\n\n') +
      `\n\nReply with the quantity to book your order.`
    );
  };

  const pickProducts = (ids: string[]) => {
    setProductIds(ids);
    const picked = products.filter((p) => ids.includes(p.id));
    if (!aiUsed && picked.length) {
      const p0 = picked[0];
      const pStr = String(p0.sale_price);
      const sStr = String(p0.stock_qty);
      setTitle(picked.length === 1 ? `${pname(p0)} offer` : 'New stock offer');
      setOfferPrice(picked.length === 1 ? pStr : '');
      setOfferStock(picked.length === 1 ? sStr : '');
      setMessage(buildMessage(picked, pStr, sStr, countries));
    }
  };

  const updatePrice = (val: string) => {
    setOfferPrice(val);
    const picked = products.filter((p) => productIds.includes(p.id));
    if (picked.length) {
      setMessage(buildMessage(picked, val, offerStock, countries));
    }
  };

  const maxAvailableStock = useMemo(() => {
    const picked = products.filter((p) => productIds.includes(p.id));
    if (!picked.length) return 0;
    return picked.reduce((acc, p) => acc + (p.stock_qty || 0), 0);
  }, [products, productIds]);

  const updateStock = (val: string) => {
    if (val === '') {
      setOfferStock('');
      const picked = products.filter((p) => productIds.includes(p.id));
      if (picked.length) setMessage(buildMessage(picked, offerPrice, '', countries));
      return;
    }
    const numVal = parseInt(val, 10);
    const validVal = isNaN(numVal) ? 0 : Math.max(0, maxAvailableStock > 0 ? Math.min(numVal, maxAvailableStock) : numVal);
    const validStr = String(validVal);
    setOfferStock(validStr);
    const picked = products.filter((p) => productIds.includes(p.id));
    if (picked.length) {
      setMessage(buildMessage(picked, offerPrice, validStr, countries));
    }
  };

  const updateCountries = (val: string[]) => {
    setCountries(val);
    const picked = products.filter((p) => productIds.includes(p.id));
    if (picked.length && !aiUsed) {
      setMessage(buildMessage(picked, offerPrice, offerStock, val));
    }
  };

  const recipients = (audience || []).filter((a) => !excluded.has(a.id));
  const closedWindow = recipients.filter((r) => r.channel !== 'email' && !r.windowOpen).length;
  const byEmail = recipients.filter((r) => r.channel === 'email').length;

  const send = async () => {
    setSending(true);
    setErr(null);
    try {
      const { broadcast } = await api<{ broadcast: Broadcast }>('/api/broadcasts', {
        method: 'POST',
        body: JSON.stringify({
          title,
          message,
          product_ids: productIds,
          filters: { countries, tiers, brands },
          contact_ids: recipients.map((r) => r.id),
          template_name: template || null,
          template_language: defaults.lang,
          ai_suggested: aiUsed,
        }),
      });
      setOk(`Broadcast sent: ${broadcast.sent_count} delivered to WhatsApp, ${broadcast.failed_count} failed.`);
      setConfirming(false);
      setAiUsed(false);
      loadList();
      setTab('history');
    } catch (e: any) {
      setErr(e.message);
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto pr-1">
      <PageHeader
        title="Broadcast"
        subtitle="Send a product offer to the right customers on WhatsApp, with AI picking what to push."
        right={
          <>
            <PillTabs value={tab} onChange={setTab} items={[{ id: 'new', label: 'New broadcast' }, { id: 'history', label: 'History', count: history?.length }]} />
            {tab === 'history' && <ExportButton entity="broadcasts" />}
          </>
        }
      />
      <ErrorNote text={err} />
      {ok && <div className="rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-2.5 mb-4">{ok}</div>}

      {tab === 'history' ? (
        <History list={history} />
      ) : (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
          {/* AI suggestions */}
          <Card className="xl:col-span-12 bg-gradient-to-br from-white to-orange-50/60">
            <CardHeader
              title="AI suggestions"
              subtitle="Picks from stock, sales pace, margins and customer demand. Gemini writes the copy."
              right={
                <Button variant="brand" onClick={getSuggestions} loading={suggLoading}>
                  <Sparkles className="w-4 h-4" /> {sugg ? 'Refresh' : 'Suggest products'}
                </Button>
              }
            />
            {sugg?.error && <p className="text-xs text-amber-700 mb-3">AI note: {sugg.error}. Showing rule-based picks.</p>}
            {sugg && !sugg.suggestions.length && <p className="text-sm text-slate-500">Nothing to push right now: no product has extra stock with interested customers.</p>}
            {sugg && sugg.suggestions.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {sugg.suggestions.map((s, i) => (
                  <div key={s.product_id} className={cx('rounded-3xl p-4 flex flex-col', i === 0 ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200/70')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cx('text-[11px] font-semibold uppercase tracking-wide', i === 0 ? 'text-orange-300' : 'text-orange-600')}>{i === 0 ? 'Top pick' : `Pick ${i + 1}`}</span>
                      <span className={cx('text-[11px]', i === 0 ? 'text-slate-300' : 'text-slate-500')}>{sugg.source === 'gemini' ? '✦ by Gemini' : 'rules'}</span>
                    </div>
                    <div className="font-semibold mt-1.5 leading-snug">{s.product}</div>
                    <div className={cx('text-xs mt-1', i === 0 ? 'text-slate-300' : 'text-slate-500')}>
                      {num(s.stock)} in stock · {money(s.sale_price, s.currency)}
                      {s.suggestedDiscountPct ? ` · up to ${s.suggestedDiscountPct}% off` : ''}
                    </div>
                    {s.aiNote && <p className={cx('text-xs mt-2', i === 0 ? 'text-white' : 'text-slate-700')}>{s.aiNote}</p>}
                    <ul className={cx('text-xs mt-2 space-y-1 flex-1', i === 0 ? 'text-slate-300' : 'text-slate-600')}>
                      {s.reasons.slice(0, 3).map((r) => (
                        <li key={r}>• {r}</li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between mt-3">
                      <span className={cx('text-xs inline-flex items-center gap-1', i === 0 ? 'text-slate-300' : 'text-slate-500')}>
                        <Users className="w-3.5 h-3.5" /> {s.audienceSize} customers
                      </span>
                      <Button size="sm" variant={i === 0 ? 'brand' : 'dark'} onClick={() => useSuggestion(s)}>
                        Use this
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!sugg && !suggLoading && <p className="text-sm text-slate-500">Ask the AI which product to push today. You review everything before anything is sent.</p>}
          </Card>

          {/* Composer */}
          <Card className="xl:col-span-7" id="composer">
            <CardHeader title="1. Products" subtitle="What are you selling? Only products in stock are listed." />
            <MultiSelect
              options={products.map((p) => p.id)}
              value={productIds}
              onChange={pickProducts}
              placeholder="Choose products"
              searchPlaceholder="Search brand or model"
              render={(id) => {
                const p = products.find((x) => x.id === id);
                return p ? pname(p) : id;
              }}
              sub={(id) => {
                const p = products.find((x) => x.id === id);
                return p ? `${p.stock_qty} in stock · ${money(p.sale_price, p.currency)}` : undefined;
              }}
            />

            <div className="border-t border-slate-100 my-5" />
            <CardHeader title="2. Customers" subtitle="Every filter is optional. Leave one empty to include everyone." />
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Country">
                <MultiSelect options={options.countries} value={countries} onChange={updateCountries} placeholder="All countries" searchPlaceholder="Search country" />
              </Field>
              <Field label="Payment tier">
                <MultiSelect options={['high', 'medium', 'low']} value={tiers} onChange={setTiers} placeholder="All tiers" render={(o) => (o === 'high' ? 'High paying' : o === 'medium' ? 'Medium' : 'Low paying')} />
              </Field>
              <Field label="Brands asked for / bought">
                <MultiSelect options={options.brands} value={brands} onChange={setBrands} placeholder="All brands" searchPlaceholder="Search brand" />
              </Field>
            </div>

            <div className="border-t border-slate-100 my-5" />
            <CardHeader title="3. Message" subtitle="{name} becomes the customer's first name." />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Offer price per piece">
                  <input
                    type="number"
                    className={inputCls}
                    value={offerPrice}
                    onChange={(e) => updatePrice(e.target.value)}
                    placeholder="e.g. 750"
                  />
                </Field>
                <Field
                  label="Offer stock (units)"
                  hint={maxAvailableStock > 0 ? `Max available: ${maxAvailableStock} units` : undefined}
                >
                  <input
                    type="number"
                    min={1}
                    max={maxAvailableStock > 0 ? maxAvailableStock : undefined}
                    className={inputCls}
                    value={offerStock}
                    onChange={(e) => updateStock(e.target.value)}
                    placeholder={maxAvailableStock > 0 ? `Max ${maxAvailableStock}` : 'e.g. 50'}
                  />
                </Field>
              </div>
              <Field label="Title (for your records)"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="iPhone 13 clearance" /></Field>
              <Field label="Message">
                <textarea rows={8} className={inputCls} value={message} onChange={(e) => { setMessage(e.target.value); }} maxLength={1000} />
              </Field>
              <Field
                label="Approved WhatsApp template (for customers outside the 24 h window)"
                hint="WhatsApp only allows free text within 24 h of the customer's last message. Others get this template with {{1}} = first name, {{2}} = your message above. Until Meta approves phonebuzz_offer, they get the phonebuzz_intro template instead."
              >
                <input className={inputCls} value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="phonebuzz_offer" />
              </Field>
            </div>
          </Card>

          {/* Audience preview */}
          <div className="xl:col-span-5 flex flex-col gap-4">
            <Card className="flex flex-col max-h-[640px]">
              <CardHeader
                title="Recipients"
                subtitle={audience ? `${recipients.length} selected of ${audience.length} matching` : 'Loading'}
                right={
                  audience && audience.length > 0 && (
                    <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setExcluded(excluded.size ? new Set() : new Set(audience.map((a) => a.id)))}>
                      {excluded.size ? 'Select all' : 'Clear all'}
                    </button>
                  )
                }
              />
              <div className="mb-2">
                <SearchInput value={rq} onChange={setRq} placeholder="Search recipients" />
              </div>
              <div className="flex-1 overflow-y-auto -mx-2">
                {!audience ? (
                  <Loading />
                ) : !audience.length ? (
                  <div className="text-center py-6">
                    <Empty title="No customers match these filters" />
                    {(countries.length > 0 || tiers.length > 0 || brands.length > 0) && (
                      <button
                        className="mt-2 text-sm font-semibold text-orange-600 hover:text-orange-700"
                        onClick={() => {
                          setCountries([]);
                          setTiers([]);
                          setBrands([]);
                        }}
                      >
                        Clear filters (send to all customers)
                      </button>
                    )}
                  </div>
                ) : (
                  audience.filter((a) => !rq || `${a.name} ${a.wa_id} ${a.country} ${a.brands.join(' ')}`.toLowerCase().includes(rq.toLowerCase())).map((a) => {
                    const on = !excluded.has(a.id);
                    return (
                      <label key={a.id} className="flex items-center gap-3 px-2 py-2 rounded-2xl hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            const n = new Set(excluded);
                            on ? n.add(a.id) : n.delete(a.id);
                            setExcluded(n);
                          }}
                          className="accent-slate-800 w-4 h-4"
                        />
                        <Avatar name={a.name || a.email || a.wa_id} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-800 truncate">{a.name || (a.channel === 'email' ? a.email : `+${a.wa_id}`)}</div>
                          <div className="text-[11px] text-slate-500 truncate">{a.country || '—'} · {a.brands.join(', ') || 'no brands'}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <TierBadge tier={a.tier} />
                          <div className="text-[10px] text-slate-400 mt-0.5 inline-flex items-center gap-1">
                            {a.channel === 'email' ? <><Mail className="w-3 h-3 text-sky-600" /> email</> : a.windowOpen ? <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> WhatsApp</> : <><Clock className="w-3 h-3" /> WhatsApp template</>}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Will send to</span>
                <b className="text-slate-800">{recipients.length} customers</b>
              </div>
              {byEmail > 0 && (
                <p className="text-xs mt-2 text-slate-500 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-sky-600" /> {byEmail} of them came by email and get it by email (subject = title).
                </p>
              )}
              {closedWindow > 0 && (
                <p className={cx('text-xs mt-2', template ? 'text-slate-500' : 'text-amber-700')}>
                  {closedWindow} of them last wrote more than 24 h ago{template ? ` and get the "${template}" template.` : '. Add an approved template, or they will be skipped.'}
                </p>
              )}
              {(!recipients.length || message.trim().length < 5 || !title.trim()) && (
                <p className="text-xs text-amber-700 mt-2">
                  {!recipients.length ? 'Select at least one customer (clear the filters if the list is empty).' : !title.trim() ? 'Add a title.' : 'Write the message (at least 5 characters).'}
                </p>
              )}
              <Button className="w-full mt-4" variant="brand" disabled={!recipients.length || message.trim().length < 5 || !title.trim()} onClick={() => setConfirming(true)}>
                <Send className="w-4 h-4" /> Review & send
              </Button>
            </Card>
          </div>
        </div>
      )}

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Send this broadcast?">
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            <b className="text-slate-800">{recipients.length}</b> customers will get this on WhatsApp. This cannot be undone.
          </p>
          <div className="rounded-2xl bg-[#efeae2] p-3">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[13px] text-slate-800 whitespace-pre-wrap shadow-sm">
              {message.replace(/\{name\}/g, (recipients[0]?.name || 'Ali').split(' ')[0])}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="brand" onClick={send} loading={sending}>
              <Megaphone className="w-4 h-4" /> Send now
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function History({ list }: { list: Broadcast[] | null }) {
  const [open, setOpen] = useState<Broadcast | null>(null);
  const [rec, setRec] = useState<BroadcastRecipient[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setRec(null);
    api<{ recipients: BroadcastRecipient[] }>(`/api/broadcasts/${open.id}`).then((d) => setRec(d.recipients)).catch(() => setRec([]));
  }, [open]);
  if (!list) return <Loading />;
  if (!list.length) return <Card><Empty title="No broadcasts yet" text="Your sent broadcasts and their delivery results show up here." /></Card>;
  const color = { sent: 'green', partial: 'amber', failed: 'red', sending: 'blue', draft: 'gray' } as const;
  return (
    <Card>
      <Table head={['Broadcast', 'Recipients', 'Sent', 'Failed', 'Status', 'Date']}>
        {list.map((b) => (
          <tr key={b.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => setOpen(b)}>
            <td className={td}>
              <div className="font-medium text-slate-800">{b.title}</div>
              {b.ai_suggested && <Chip tone="orange">AI suggested</Chip>}
            </td>
            <td className={cx(td, 'tabular-nums')}>{b.total_recipients}</td>
            <td className={cx(td, 'tabular-nums')}>{b.sent_count}</td>
            <td className={cx(td, 'tabular-nums')}>{b.failed_count}</td>
            <td className={td}><StatusDot color={color[b.status]} label={b.status} /></td>
            <td className={cx(td, 'text-slate-500 whitespace-nowrap')}>{dateTime(b.sent_at || b.created_at)}</td>
          </tr>
        ))}
      </Table>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title || ''} wide>
        {open && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 whitespace-pre-wrap rounded-2xl bg-slate-50 p-3">{open.message}</p>
            {!rec ? (
              <Loading />
            ) : (
              <Table head={['Customer', 'Number', 'Status', 'Detail']} minWidth={520}>
                {rec.map((r) => (
                  <tr key={r.id}>
                    <td className={td}>{r.name || '—'}</td>
                    <td className={cx(td, 'text-slate-500')}>{contactLabel(r)}</td>
                    <td className={td}><StatusDot color={r.status === 'failed' ? 'red' : r.status === 'queued' ? 'gray' : 'green'} label={r.status} /></td>
                    <td className={cx(td, 'text-xs text-slate-500')}>{r.error || ''}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
