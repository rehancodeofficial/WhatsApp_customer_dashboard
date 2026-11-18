# Phone Buzz WhatsApp Inbox

A web dashboard for the Phone Buzz FZCO WhatsApp AI sales agent (n8n). It shows every customer
chat live, and lets the owner **pause the AI for one customer**, talk to that customer personally,
and **resume the AI**, which then continues with the full conversation in memory.

## What it does

- **All customer chats, live**: WhatsApp-Web style list + chat + customer panel. Search by name,
  number or message text. Filters: unread, AI, human, handoff, starred, archived.
- **AI on/off per customer**: the big button in the chat header. Options: pause until you resume,
  pause 30 min, pause 2 h, mark as sales handoff. Pausing one chat never affects another.
- **Reply from the dashboard**: sent through the official WhatsApp Cloud API. Replying while the
  AI is on pauses it automatically for that customer, so you and the AI never answer at the same time.
- **AI remembers what you said**: your replies and the customer's messages during a pause go into
  the same Postgres memory table n8n's AI reads (`n8n_chat_histories`).
- **Resume & Reply Now**: turns the AI back on and asks n8n to answer the last message immediately.
- **Meta 24-hour rule**: countdown in the header; free text is blocked after 24 h and a template
  picker opens instead.
- **Delivery ticks**: sent, delivered, read, failed (with the Meta reason in plain words).
- **Audit log** of every pause/resume, **sound + browser alerts** for new messages in paused chats.
- **Login** with Supabase Auth. Owners see all chats, agents see unassigned chats and their own.

## Try it right now (demo mode)

```bash
npm install
npm run dev
```

Open http://localhost:3000. While Supabase is not configured the app runs in **demo mode**:
sample chats, no login, nothing is sent to WhatsApp. Use the purple **Test as customer** button
to play a customer and see the AI reply (AI on) or stay quiet (paused).

## Go live

1. **Supabase**: create a project. In SQL Editor run the files in `supabase/migrations/` in order
   (1 → 5). Skip `seed.sql` in production.
2. **Staff accounts**: Supabase → Authentication → Users → Add user (email + password).
   The first user becomes **owner**, later users become **agents** (change in the `profiles` table).
3. **Env vars**: copy `.env.example` to `.env.local` (and to Vercel → Settings → Environment Variables)
   and fill everything in. `WHATSAPP_ACCESS_TOKEN` must be a permanent System User token of the same
   Meta app n8n uses.
4. **Deploy**: push to GitHub and import into Vercel (or `npx vercel`).
5. **n8n**: follow [N8N_CHANGES.md](./N8N_CHANGES.md) step by step.
6. **Old chats (optional)**: `npm run import-sheets` imports `Customer_Leads` / `Customer_Chats`
   from the Google Sheet (see the script header for the env vars it needs).

Timed pauses also end by themselves when the customer writes next. To flip them on the dashboard
on time, Vercel Cron calls `/api/cron/auto-resume` (see `vercel.json`; on the Vercel Hobby plan crons
run once a day, so use the `pg_cron` line at the end of migration 5 instead).

## How it fits together

```
Customer ──WhatsApp──> Meta ──webhook──> n8n ──POST /api/n8n/inbound──> Dashboard (Supabase)
                                          │      <── { mode: ai | human | handoff }
                                          ├─ mode = human  → stop (you answer in the dashboard)
                                          └─ otherwise     → AI Sales Agent → reply → /api/n8n/outbound-log
Dashboard ──WhatsApp Cloud API──> Customer          (your manual replies)
Dashboard ──n8n_chat_histories──> AI memory          (so the AI knows what you said)
```

| Endpoint | Who calls it | Auth |
|---|---|---|
| `POST /api/n8n/inbound` | n8n, every customer message | `x-n8n-secret` |
| `POST /api/n8n/outbound-log` | n8n, after the AI sends | `x-n8n-secret` |
| `POST /api/n8n/status` | n8n, delivery receipts | `x-n8n-secret` |
| `POST /api/n8n/mode` | n8n, handoff / payment verified | `x-n8n-secret` |
| `GET /api/conversations`, `GET/PATCH /api/conversations/:id` | dashboard | login |
| `POST /api/conversations/:id/mode` | dashboard pause/resume | login |
| `POST /api/conversations/:id/run-ai` | dashboard "Resume & Reply Now" | login |
| `POST /api/messages/send` | dashboard reply | login |
| `GET /api/cron/auto-resume` | Vercel Cron | `CRON_SECRET` |

## Tests

```bash
npm test            # unit tests: per-customer pause/resume, memory, timed pause, idempotency, search
npm run build && npm run test:e2e   # browser test in demo mode (first time: npx playwright install chromium)
```

## Project layout

- `src/app/dashboard` – the inbox UI; `src/app/login` – sign-in
- `src/app/api` – route handlers listed above
- `src/lib/repo` – data layer: `supabase.ts` (live) and `memory.ts` (demo mode), shared rules in `logic.ts`
- `src/middleware.ts` – login protection
- `supabase/migrations` – tables, `set_ai_mode()` (row-locked, audited), RLS, Realtime
