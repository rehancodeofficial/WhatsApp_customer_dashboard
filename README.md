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
- **Chats are view-only**: Customer Chats and Supplier Chats show only the customer/supplier and the AI.
  When the AI is paused the owner talks from his own WhatsApp; that period shows as one "Manual" marker
  and the chat continues when the AI is back. Nothing is sent from the chat screens.
- **Owner notifications**: every alert the AI sends the owner on WhatsApp also appears in the bell, with
  buttons to open the chat in the dashboard or in WhatsApp.
- **Excel export** on every records page.
- **Replaces the Google Sheets** with a real database and these pages:
  - **Overview**: sales analytics (revenue, profit, orders, units, revenue by brand / country /
    product / customer, order sources), stock health, recent orders. 7 / 30 / 90 / 365 day ranges.
  - **Customers**: avatar list with filters (country, high / medium / low paying), each customer's
    WhatsApp chat with the AI (read-only), orders, brands asked for and bought, record editing.
  - **Inventory**: analytics (stock value, stock in vs out, fast / slow movers, reorder list),
    stock records, and a movement log (every stock change is logged).
  - **Orders** and **Suppliers**: full records. Creating an order takes stock out; cancelling puts it back.
  - **Broadcast**: pick products, filter customers by country, payment tier and brands (each filter
    optional), un-tick anyone, send on WhatsApp. **AI suggestions** pick which product to push (slow
    movers with stock, margin and interested buyers) and write the offer. History with per-customer results.
- **Role-based access**: the **Admin** (owner) has everything and creates every user. The Admin builds
  roles (e.g. "Sales", "Inventory Clerk") by ticking exactly which permissions each gets, in
  **Team & Access**. Nothing un-ticked is possible: every API route checks it on the server, the menu
  only mirrors it. Managing users/roles and Settings can never be granted.

## Try it right now (demo mode)

```bash
npm install
npm run dev
```

Open http://localhost:3000. While Supabase is not configured (or with `NEXT_PUBLIC_DEMO_MODE=true`)
the app runs in **demo mode**: sample chats, nothing is sent to WhatsApp, and the login page offers
two demo accounts: `admin@phonebuzz.demo` / `Admin@123` and `management@phonebuzz.demo` / `Manage@123`. Use the purple **Test as customer** button
to play a customer and see the AI reply (AI on) or stay quiet (paused).

## Go live

1. **Supabase**: create a project. In SQL Editor paste and run **`supabase/schema.sql`** (the whole
   database in one file). Already ran migrations 1 → 6 before? Then run only
   `supabase/migrations/20261119000007_business_modules.sql`. Skip `seed.sql` in production.
2. **First Admin**: open the dashboard's /login page. While no staff account exists it shows
   **"Create Admin account"**. After that, the Admin adds everyone else from **Staff & Access**.
3. **Env vars**: copy `.env.example` to `.env.local` (and to Vercel → Settings → Environment Variables)
   and fill everything in. `WHATSAPP_ACCESS_TOKEN` must be a permanent System User token of the same
   Meta app n8n uses. Optional: `WHATSAPP_BROADCAST_TEMPLATE` (an approved template for customers outside
   the 24 h window), `CLAUDE_API_KEY` (lets Claude write broadcast suggestions), `TIER_*_MIN_AED`.
4. **Deploy**: push to GitHub and import into Vercel (or `npx vercel`).
5. **n8n**: follow [N8N_CHANGES.md](./N8N_CHANGES.md) step by step.
6. **Copy the Google Sheet into the dashboard**: `npm run import-sheet-db` copies every tab the n8n flow
   uses (leads, customers, inventory, orders, order items, suppliers, supplier requests / quotes / demands,
   supplier chats). Safe to run again.
7. **Broadcasts**: follow [META_SETUP.md](./META_SETUP.md) (token, approved template, limits).

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
npm test            # unit tests: pause/resume, memory, roles & permissions, tiers, broadcast filters,
                    # AI suggestions, analytics, order ↔ stock consistency
npm run build && npm run test:e2e   # browser test in demo mode (first time: npx playwright install chromium)
```

## Project layout

- `src/app/dashboard` – the app; `src/components/app` – shell, UI kit, charts and one file per page
- `src/lib/biz` – business modules: `store.ts` (Supabase / demo), `logic.ts` (tiers, filters, analytics,
  suggestions), `service.ts` (broadcast sending), `ai-suggest.ts` (Claude)
- `src/lib/permissions.ts`, `src/lib/roles.ts` – permissions and custom roles
- `src/app/login` – sign-in
- `src/app/api` – route handlers listed above
- `src/lib/repo` – data layer: `supabase.ts` (live) and `memory.ts` (demo mode), shared rules in `logic.ts`
- `src/middleware.ts` – login protection
- `supabase/migrations` – tables, `set_ai_mode()` (row-locked, audited), `create_order()`, RLS, Realtime;
  `supabase/schema.sql` is all of them in one file
