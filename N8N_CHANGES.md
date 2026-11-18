# n8n changes for "PhoneBuzz Automation AI Agent"

These steps connect your existing workflow to the dashboard. Nothing in the owner or supplier
flows changes. Make a copy of the workflow first (⋯ → Duplicate) and do the changes on the copy,
test with your own number, then publish.

Everywhere below:

- `DASHBOARD_URL` = where the dashboard runs, e.g. `https://phonebuzz-inbox.vercel.app`
- Every HTTP Request node sends the header `x-n8n-secret` = the same value as `N8N_WEBHOOK_SECRET`
  in the dashboard. Best: create one **Header Auth** credential in n8n
  (Name `x-n8n-secret`, Value = your secret) and pick it in every HTTP node.
- Every HTTP Request node: **Settings → On Error → "Continue (using regular output)"**.
  If the dashboard is ever down, the AI keeps working exactly like today.

---

## How it works after the change

```
WhatsApp Trigger → … → Inquiry Data → Find Customer Lead → … → Final Customer Language
        → [1] Log Inbound to Dashboard        (saves the message, returns this customer's mode)
        → [2] AI Enabled for Customer?
              ├─ false (you took over)  → stop. You answer from the dashboard.
              └─ true → Handed Over to Sales? [3 changed condition]
                          ├─ true  → existing handoff auto-reply (unchanged)
                          └─ false → AI Sales Agent → … → Send WhatsApp Reply
                                                              → [4] Log AI Reply to Dashboard
```

The mode is stored per customer (per WhatsApp number), so pausing one chat never touches another.

---

## [1] HTTP Request "Log Inbound to Dashboard"

Insert it **between `Final Customer Language` and `Handed Over to Sales?`**
(drag the existing connection onto the new node).

- Method `POST`, URL `DASHBOARD_URL/api/n8n/inbound`
- Authentication: Generic → Header Auth → your `x-n8n-secret` credential
- Send Body: JSON, "Using JSON", expression:

```js
{{ JSON.stringify({
  wa_id: $('Inquiry Data').first().json.whatsapp_number,
  wa_message_id: $('Inquiry Data').first().json.message_id,
  name: $('Find Customer Lead').first().json.Customer_Name || $('Inquiry Data').first().json.customer_name || '',
  profile_name: $('Inquiry Data').first().json.customer_name || '',
  country: $('Find Customer Lead').first().json.Country || '',
  preferred_language: $('Final Customer Language').first().json.language || '',
  lead_id: $('Find Customer Lead').first().json.Lead_ID || '',
  lead_status: $('Find Customer Lead').first().json.Lead_Status || '',
  type: $('Inquiry Data').first().json.channel === 'whatsapp' ? ($('WhatsApp Trigger').first().json.messages?.[0]?.type || 'text') : 'other',
  body: $('Inquiry Data').first().json.message || '',
}) }}
```

Email inquiries also pass through `Inquiry Data`. They have no WhatsApp number, so the dashboard
answers 400 and, because of "Continue", the email flow runs exactly as today.

## [2] IF "AI Enabled for Customer?"

Directly after [1].

- Condition (Boolean → is true): `{{ $json.mode !== 'human' }}`
- **true** → `Handed Over to Sales?` (the old connection)
- **false** → nothing (or a WhatsApp node that pings the owner: "New message from … while you are handling the chat").

`human` = you pressed "Takeover" in the dashboard. A missing `mode` (dashboard down) counts as true.

## [3] Change the condition of `Handed Over to Sales?`

Replace the left value `{{ $('Find Customer Lead').first().json.Lead_Status ?? '' }}` / equals `Handed Over to Sales`
with a Boolean "is true" condition:

```js
{{ $('Log Inbound to Dashboard').first().json.mode
   ? $('Log Inbound to Dashboard').first().json.mode === 'handoff'
   : ($('Find Customer Lead').first().json.Lead_Status === 'Handed Over to Sales') }}
```

So when you press **Resume AI** in the dashboard, the AI answers again even if the sheet still says
"Handed Over to Sales". If the dashboard is down, it falls back to the sheet like today.

## [4] HTTP Request "Log AI Reply to Dashboard"

After **`Send WhatsApp Reply`**.

- Method `POST`, URL `DASHBOARD_URL/api/n8n/outbound-log`, same auth
- Body (expression):

```js
{{ JSON.stringify({
  wa_id: $('Inquiry Data').first().json.whatsapp_number,
  wa_message_id: $json.messages?.[0]?.id || '',
  type: 'text',
  body: $('Prepare Lead Record').first().json.reply,
  sender_type: 'ai',
}) }}
```

Do the same after the other nodes that write to customers on WhatsApp, so the dashboard shows
every message. Only `wa_id` and `body` change:

| After node | wa_id | body |
|---|---|---|
| Send Handoff Auto-Reply on WhatsApp | `$('Inquiry Data').first().json.whatsapp_number` | `$('Write Handoff Auto-Reply').first().json.text` |
| Send Order Confirmation to Customer on WhatsApp | `$('Inquiry Data').first().json.whatsapp_number` | `$('Write Customer Order Confirmation').first().json.text` |
| Send Price Offer on WhatsApp | `$('Plan Price Offer').first().json.whatsapp_number` | `$('Translate Price Offer').first().json.text` |
| Send Payment Confirmation on WhatsApp | `$('Get Lead for Payment').first().json.WhatsApp_Number` | `$('Write Payment Confirmation').first().json.text` |
| Send Back-in-Stock on WhatsApp | `$('Get Customer Request').first().json.WhatsApp_Number` | `$('Write Back-in-Stock Message').first().json.text` |
| Send Intro on WhatsApp | `$('Finalize Outreach').first().json.number` | `$('Finalize Outreach').first().json.intro` |

(Messages sent to a number that never wrote to you are skipped by the dashboard with a 404. That is fine.)

## [5] Delivery ticks: HTTP Request "Forward Status to Dashboard"

On the **true** output of `Delivery Status Update?` (add it as a second connection, keep the existing ones).

- Method `POST`, URL `DASHBOARD_URL/api/n8n/status`, same auth
- Body (expression): `{{ JSON.stringify({ statuses: $('WhatsApp Trigger').first().json.statuses }) }}`

## [6] Keep handoff and "PAYMENT VERIFIED" in sync

HTTP Request nodes to `DASHBOARD_URL/api/n8n/mode`, same auth:

1. **AI handed the customer to sales**: add an IF after `Prepare Lead Record`
   (`{{ $json.action === 'handoff' && $json.channel === 'whatsapp' }}`), true → HTTP with body
   `{{ JSON.stringify({ wa_id: $('Inquiry Data').first().json.whatsapp_number, mode: 'handoff' }) }}`.
   Keep the existing connections of `Prepare Lead Record` as they are.
2. **Owner sent PAYMENT VERIFIED (WhatsApp)**: after `Confirm Reactivation to Owner`, body
   `{{ JSON.stringify({ wa_id: String($('Get Lead for Payment').first().json.WhatsApp_Number || ''), mode: 'ai' }) }}`
3. **PAYMENT VERIFIED by email**: after `Confirm Email Reactivation to Owner`, body
   `{{ JSON.stringify({ wa_id: String($('Find Lead for Email Payment').first().json.WhatsApp_Number || ''), mode: 'ai' }) }}`

A handoff never overrides a chat you took over manually.

## [7] AI memory in the database (so the AI knows what you said)

Replace the **`Conversation Memory`** node (Window Buffer) with **Postgres Chat Memory**:

- Credential: Postgres → your Supabase database. In Supabase: Project → Connect → "Session pooler":
  Host `aws-0-<region>.pooler.supabase.com`, Port `5432`, Database `postgres`,
  User `postgres.<project-ref>`, Password = your database password, SSL `require`.
- Table name: `n8n_chat_histories` (already created by the migrations)
- Session ID: Define below → `{{ $('Inquiry Data').first().json.contact_id }}`
  (must be the plain WhatsApp number, no `-v18` suffix, because the dashboard writes your
  manual replies under the same number)
- Context Window Length: `30`

Connect it to both `AI Sales Agent` and `AI Sales Agent (Retry)`.

While you have a chat taken over, the dashboard writes the customer's messages and your replies into
this table. When you resume, the AI reads them like any other part of the conversation.

## [8] Optional: "Resume & Reply Now" button

Lets the dashboard ask the AI to answer the customer's last message immediately.

1. Add a **Webhook** node: POST, path `phonebuzz-run-ai-now`, Authentication Header Auth (same credential).
2. Add a **Set** node "Prepare Run-AI Inquiry" with the same fields as `Prepare WhatsApp Inquiry`:
   `channel` = `whatsapp`, `contact_id` / `whatsapp_number` / `conversation_id` = `{{ $json.body.wa_id }}`,
   `customer_name` = `{{ $json.body.customer_name }}`, `message_id` = `{{ $json.body.wa_message_id }}`,
   `message` = `{{ $json.body.message }}`, `email` = `''`, `subject` = `''`.
3. Connect it into `Inquiry Data`.
4. Copy the webhook's **Production URL** into the dashboard env var `N8N_TRIGGER_AI_WEBHOOK_URL`.

Test it once with your own number: some later nodes read the original WhatsApp Trigger, and n8n will
show an error there if one of them is not covered.

---

## Test checklist

1. Message the business number from your phone → the chat appears in the dashboard, the AI replies, and the reply shows in the dashboard.
2. Press **AI Responding** to switch it to **Takeover Active** → message again → no AI reply, the message shows in the dashboard.
3. Reply from the dashboard → it arrives on your phone.
4. Press the button again (Resume) → message again → the AI replies and knows what you wrote in step 3.
5. A second phone number stays on AI the whole time.
