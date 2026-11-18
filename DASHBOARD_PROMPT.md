# Prompt: PhoneBuzz WhatsApp Inbox Dashboard (AI on/off per customer)

> Copy everything below the line into Claude Code (or any AI coding tool), inside an empty project folder.

---

## Role

You are a senior full-stack engineer. Build a production-ready, web-based **WhatsApp inbox dashboard** for **Phone Buzz FZCO** (B2B wholesale mobile phones, Dubai). It sits next to an existing **n8n** workflow ("PhoneBuzz Automation AI Agent") that already runs an AI sales agent on WhatsApp. Work step by step, explain each step briefly, and do not skip the database migrations, the n8n changes, or the tests.

## What exists today (do not break it)

- **WhatsApp:** official **Meta WhatsApp Cloud API**, received in n8n by the `WhatsApp Trigger` node (phone number ID `1483995271455253`). Messages are text, image (described by Gemini), and audio (transcribed by Gemini). Status updates (sent, delivered, read, failed) come in on the same trigger.
- **Routing:** `Route WhatsApp Sender` splits messages into **Owner / Sales Team** (number 971525965784), **Supplier** (found in the Google Sheet `Suppliers`), and **Customer**. **This dashboard is only for Customer chats.** Owner and supplier flows stay as they are.
- **Customer path:** `Route by Message Type` → `Prepare WhatsApp Inquiry` → `Inquiry Data` → `Find Customer Lead` (Google Sheet `Customer_Leads`) → `Final Customer Language` → `Handed Over to Sales?` → `AI Sales Agent` (Gemini, tools: Inventory, Company Info, FAQ, Wholesale Policy, Calculator) → `Prepare Lead Record` → `Send WhatsApp Reply`.
- **AI memory:** `Conversation Memory` (Window Buffer, session key `{{contact_id}}-v18`, 30 messages). It is in-memory, so it does not survive restarts and does not see messages a human sends.
- **Today's "pause":** only an automatic one. When the AI sets `action = handoff`, `Lead_Status` becomes `Handed Over to Sales` and the AI stops answering until the owner sends `PAYMENT VERIFIED ORD-...`. There is **no manual pause/resume per customer.**
- **Chat history today:** `Build Chat Log Row` → `Save Customer Chat` writes the whole conversation as one text cell into the Google Sheet `Customer_Chats`. Not suitable for a real inbox.
- **24-hour rule:** Meta blocks free-form messages if the customer has not written in the last 24 hours (error 131047). Outside the window, only approved templates can be sent.

## Goal

1. Show **all customer WhatsApp chats** in a modern web dashboard, live, like WhatsApp Web.
2. Per customer, the owner can **pause the AI** and talk to the customer personally from the dashboard.
3. The owner can **resume the AI** for that customer, and the AI continues the conversation **with full context**, including what the human said while it was paused.
4. The pause is **independent for each customer.** Pausing one chat never affects another.

## Tech stack

- **Frontend + API:** Next.js 15 (App Router, TypeScript, Server Actions / Route Handlers), Tailwind CSS, shadcn/ui, lucide-react icons, TanStack Query.
- **Database:** **Supabase** (managed PostgreSQL) with Supabase Auth, Realtime and Storage. Keep all SQL in plain Postgres migrations in `supabase/migrations/` so it can also run on a self-hosted PostgreSQL. Use `pgvector` only if needed later; not now.
- **Realtime:** Supabase Realtime on the `messages` and `conversations` tables.
- **Deploy:** Vercel (dashboard) + Supabase cloud. Provide `.env.example`.
- **Validation:** zod. **Testing:** Vitest for logic, Playwright for one end-to-end flow.

## Database schema (PostgreSQL)

Create these tables with sensible indexes, `created_at/updated_at` timestamps, and Row Level Security:

- `contacts`: id (uuid), wa_id (text, unique, the customer phone number in E.164 without +), name, profile_name, country, preferred_language, lead_id (links to the sheet `Lead_ID`), lead_status, tags (text[]), notes, created_at.
- `conversations`: id, contact_id (unique FK), **ai_enabled (boolean, default true)**, **mode (enum: `ai`, `human`, `handoff`)**, paused_by (user id, nullable), paused_at, resume_at (nullable, for auto-resume), assigned_to (user id, nullable), last_message_at, last_customer_message_at (for the 24h window), unread_count, last_message_preview, status (`open`, `closed`).
- `messages`: id, conversation_id, wa_message_id (unique, for idempotency), direction (`inbound`, `outbound`), sender_type (`customer`, `ai`, `agent`, `system`), sender_user_id (nullable), type (`text`, `image`, `audio`, `document`, `template`, `other`), body, media_url, media_mime, transcript_or_caption, status (`queued`, `sent`, `delivered`, `read`, `failed`), error_code, error_message, raw (jsonb), created_at.
- `ai_mode_events`: audit log of every pause/resume (conversation_id, from_mode, to_mode, changed_by, reason, created_at).
- `profiles`: dashboard users (id = auth.users.id, full_name, role `owner` | `agent`).
- `n8n_chat_histories`: the standard table used by n8n's **Postgres Chat Memory** node (session_id, message jsonb). Session id = customer wa_id.

Add a Postgres function `set_ai_mode(conversation_id, mode, user_id, reason)` that updates `conversations` and writes to `ai_mode_events` in one transaction.

## How the pause / resume works (core logic)

**Single source of truth:** `conversations.mode` and `conversations.ai_enabled` in Postgres.

**Inbound message (customer → us):**
1. n8n receives it (WhatsApp Trigger stays the only Meta webhook).
2. Right after `Inquiry Data`, n8n calls the dashboard endpoint `POST /api/n8n/inbound` (or writes directly to Supabase with a Postgres node), which upserts the contact + conversation, inserts the message (idempotent on `wa_message_id`), updates `last_customer_message_at`, bumps `unread_count`, and **returns `{ ai_enabled, mode }`**.
3. New n8n IF node **"AI Enabled for Customer?"** placed before `Handed Over to Sales?`:
   - `true` → continue to the AI Sales Agent exactly as today.
   - `false` → stop here. Do not reply. The message is already in the dashboard and the owner sees it live. Optionally send the owner a short WhatsApp alert if nobody opens the chat in X minutes.
4. When the AI replies (`Send WhatsApp Reply`), n8n posts the reply to `POST /api/n8n/outbound-log` with `sender_type = 'ai'`.

**Owner pauses AI:** the "Take over" toggle in the chat header calls `set_ai_mode(..., 'human')`. Effective immediately for the very next customer message. Show a clear banner: "AI paused. You are talking to this customer."

**Owner replies manually:** the composer calls `POST /api/messages/send`. The **dashboard server** sends via the WhatsApp Cloud API (`POST https://graph.facebook.com/v21.0/{phone_number_id}/messages`) with the token stored only on the server. Save the message with `sender_type = 'agent'`. If the 24h window is closed, block free text and offer the approved template picker instead.

**Owner resumes AI:** the toggle calls `set_ai_mode(..., 'ai')`. Then the AI must "know" what happened while it was paused:
- Replace n8n's in-memory `Conversation Memory` with **Postgres Chat Memory** (same database, session key = wa_id).
- Every agent message sent from the dashboard is also inserted into `n8n_chat_histories` as an AI-side message, prefixed like `[Human agent]: ...`, and every customer message during the pause as a human-side message. This way the AI sees the full conversation when it resumes.
- Optional "Resume and let AI reply now" button: triggers an n8n webhook that runs the agent on the latest customer message.

**Existing auto handoff:** when the AI sets `action = handoff`, n8n must also call `set_ai_mode(..., 'handoff')`. `PAYMENT VERIFIED ORD-...` (both WhatsApp and the email path, nodes `Reactivate AI for Customer` and `Reactivate AI for Email Customer`) must set it back to `ai`. Keep the Google Sheet `Lead_Status` in sync so nothing else breaks.

**Optional auto-resume:** if `resume_at` is set (e.g. "pause for 2 hours"), a cron (Supabase `pg_cron` or n8n Schedule Trigger) flips it back to `ai`.

**Race safety:** n8n reads the mode at the moment the message arrives. Use `SELECT ... FOR UPDATE` inside `set_ai_mode` and make n8n's check the last step before calling the AI, so a pause clicked 1 second earlier always wins.

## Delivery status

Forward the existing `Delivery Status Update?` branch to `POST /api/n8n/status` so each message bubble shows ✓ sent, ✓✓ delivered, blue ✓✓ read, or ❗ failed with the Meta error reason (show the 131047 explanation in plain words).

## Dashboard UI

Clean, fast, WhatsApp-Web-like layout, dark and light mode, responsive down to mobile:

- **Left: chat list.** Search (name, number, message text), filters (All, Unread, AI active, Human, Handoff, Closed), avatar + name + last message + time + unread badge + a small mode badge (🤖 AI / 👤 Human / ⏸ Handoff). Sorted by last message, live updates.
- **Middle: conversation.** Bubbles color-coded by sender (customer, AI, human agent, system), images and voice notes playable, transcripts and captions shown under media, status ticks, date separators, infinite scroll upward.
  - Header: customer name, number, country, language, **big AI on/off toggle**, "pause for…" dropdown (30 min, 2 h, until I resume), assign to agent, close chat.
  - Composer: text, emoji, attach image/document, quick replies, template picker when the 24h window is closed, a countdown showing how long the 24h window stays open.
- **Right: customer panel.** Lead info from `Customer_Leads` (brand, model, storage, grade, quantity, quoted price, lead status), orders, notes, tags, and the AI mode history from `ai_mode_events`.
- **Top bar:** overall counts (open chats, waiting for human, AI handled today), notification sound and browser notification when a paused chat gets a new message.
- **Auth:** email + password via Supabase Auth, roles owner and agent. Agents only see chats assigned to them or unassigned.

## Security

- WhatsApp token, Supabase service role key and n8n secret only on the server. Never in the browser.
- All `/api/n8n/*` endpoints require a shared secret header (`x-n8n-secret`) and validate the body with zod.
- RLS on every table. The browser uses the anon key + user session only.
- Rate-limit the send endpoint. Log every outbound message.

## n8n changes (give me exact steps)

Write a short `N8N_CHANGES.md` with step-by-step instructions (node type, where to connect it, expression values):
1. HTTP Request "Log Inbound to Dashboard" after `Inquiry Data` (customer path only).
2. IF "AI Enabled for Customer?" before `Handed Over to Sales?`.
3. Replace `Conversation Memory` with Postgres Chat Memory (session key = `{{ $('Inquiry Data').first().json.contact_id }}`).
4. HTTP Request "Log AI Reply to Dashboard" after `Send WhatsApp Reply` and the other customer send nodes.
5. HTTP Request "Forward Status to Dashboard" on the delivery-status branch.
6. Set mode `handoff` when the AI hands off, and `ai` in both reactivation nodes.
7. Webhook "Run AI Now" for the resume-and-reply button.
Keep Google Sheets writes working during the migration so the owner can switch over gradually.

## Data migration

A one-time script (`scripts/import-sheets.ts`) that imports `Customer_Leads` and `Customer_Chats` from the Google Sheet into `contacts`, `conversations` and `messages` (split the conversation text on `Customer:` / `AI:` lines) so old chats appear in the dashboard.

## Deliverables

1. Full Next.js project with README (setup, env vars, deploy to Vercel + Supabase).
2. `supabase/migrations/*.sql` with tables, indexes, RLS, `set_ai_mode` function, realtime publication.
3. API routes: `/api/n8n/inbound`, `/api/n8n/outbound-log`, `/api/n8n/status`, `/api/messages/send`, `/api/conversations/[id]/mode`.
4. `N8N_CHANGES.md` and the import script.
5. Seed data and tests: unit tests for mode switching and 24h-window logic, and one Playwright test: customer message arrives → owner pauses → AI does not reply → owner replies → owner resumes → next customer message gets an AI reply that knows the human's message.

Before writing code, show me the folder structure and the database schema, then build it in this order: database, API, n8n integration, UI, tests.
