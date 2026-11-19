# Meta (WhatsApp) setup for broadcasts

Broadcasts are sent **from the same WhatsApp number the AI uses** (the dashboard calls the WhatsApp
Cloud API with the same phone number ID as n8n). Customers see the offer in the same chat as the AI.

## 1. Token and number (once)

1. Meta Business Suite → **Business settings → Users → System users** → add a system user (Admin).
2. **Add assets** → your WhatsApp Business Account (WABA) → full control.
3. **Generate new token** for your app with the permissions `whatsapp_business_messaging` and
   `whatsapp_business_management`, expiry **Never**.
4. Put it in the dashboard's environment (`.env.local` and Vercel):
   - `WHATSAPP_ACCESS_TOKEN=<that token>`
   - `WHATSAPP_PHONE_NUMBER_ID=1483995271455253` (the AI's number, already used by n8n)

## 2. Approved template for customers who wrote more than 24 h ago

WhatsApp only allows free text within 24 h of the customer's last message. Everyone else must get an
**approved template**.

1. WhatsApp Manager → **Message templates → Create template**.
2. Category **Marketing**, name e.g. `product_offer`, language English (add Urdu / Arabic if needed).
3. Body with two variables, for example:

   > Hi {{1}}, new stock at Phone Buzz: {{2}}. Reply with the quantity you need and we will book it for you.

   `{{1}}` = customer's first name, `{{2}}` = product and price (filled in by the dashboard).
4. Add sample values, submit, wait for approval (minutes to a day).
5. Set `WHATSAPP_BROADCAST_TEMPLATE=product_offer` and `WHATSAPP_BROADCAST_TEMPLATE_LANG=en`.

Customers inside the 24 h window get your full broadcast text; the others get the template.

## 3. Things Meta checks (to avoid blocks)

- **Payment method** on the WABA (WhatsApp Manager → Overview → Add payment method). Marketing
  templates are charged per message.
- **Opt-in**: only message customers who contacted you or agreed to offers. Untick "Receives broadcasts"
  on a customer who asks to stop; the dashboard skips them.
- **Messaging limit**: a new number can start conversations with ~250 people per 24 h; it grows
  (1k → 10k → 100k) as quality stays high. Keep each broadcast under your current limit.
- **Quality rating** (WhatsApp Manager → Phone numbers): many blocks or reports lower it. Send relevant
  offers (use the country / tier / brand filters) and not too often.
- **Display name** must be approved and the business verified for higher limits.

## 4. Check it works

1. Dashboard → Settings shows "WhatsApp Cloud API: Token set".
2. Send a broadcast to yourself only (filter, untick everyone else) and check the History tab.
   Failed rows show Meta's reason (e.g. template not approved, outside 24 h without a template).
