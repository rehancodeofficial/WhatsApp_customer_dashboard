-- Seed data for testing and local development

-- 1. Insert Sample Contacts
INSERT INTO contacts (id, wa_id, name, profile_name, country, preferred_language, lead_id, lead_status, tags, notes)
VALUES 
    ('c0000000-0000-0000-0000-000000000001', '971501234567', 'Tariq Al Mansoori', 'Tariq', 'United Arab Emirates', 'en', 'LEAD-101', 'Interested in iPhone 15 Pro Max', ARRAY['VIP', 'Wholesale', 'Dubai'], 'Looking for 50 pcs iPhone 15 Pro Max 256GB Natural Titanium.'),
    ('c0000000-0000-0000-0000-000000000002', '966509876543', 'Sami Al Otaibi', 'Sami', 'Saudi Arabia', 'ar', 'LEAD-102', 'Handed Over to Sales', ARRAY['Riyadh', 'Bulk Buyer'], 'Requested payment invoice for ORD-9812.'),
    ('c0000000-0000-0000-0000-000000000003', '919876543210', 'Rahul Sharma', 'Rahul S', 'India', 'en', 'LEAD-103', 'New Inquiry', ARRAY['Export', 'New'], 'Asking about export shipping fees and minimum order quantity.')
ON CONFLICT (wa_id) DO NOTHING;

-- 2. Insert Sample Conversations
INSERT INTO conversations (id, contact_id, ai_enabled, mode, paused_by, paused_at, resume_at, assigned_to, last_message_at, last_customer_message_at, unread_count, last_message_preview, status)
VALUES
    ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', true, 'ai', NULL, NULL, NULL, NULL, now() - INTERVAL '15 minutes', now() - INTERVAL '15 minutes', 0, 'We have 50 units ready in our Deira warehouse at AED 3,850 each.', 'open'),
    ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', false, 'human', NULL, now() - INTERVAL '1 hour', NULL, NULL, now() - INTERVAL '5 minutes', now() - INTERVAL '5 minutes', 1, 'Please confirm bank transfer details for Phone Buzz FZCO.', 'open'),
    ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', false, 'handoff', NULL, now() - INTERVAL '3 hours', NULL, NULL, now() - INTERVAL '2 hours', now() - INTERVAL '2 hours', 0, 'Our wholesale manager will get in touch shortly.', 'open')
ON CONFLICT (contact_id) DO NOTHING;

-- 3. Insert Sample Messages for Conversation 1 (AI Active)
INSERT INTO messages (conversation_id, wa_message_id, direction, sender_type, type, body, status, created_at)
VALUES
    ('d0000000-0000-0000-0000-000000000001', 'wamid.HBgLOTcxNTAxMjM0NTY3FQIAERgSMTFBMTIy', 'inbound', 'customer', 'text', 'Hi PhoneBuzz, do you have iPhone 15 Pro Max 256GB available in stock?', 'read', now() - INTERVAL '20 minutes'),
    ('d0000000-0000-0000-0000-000000000001', 'wamid.HBgLOTcxNTAxMjM0NTY3FQIAERgSMTFBMjMz', 'outbound', 'ai', 'text', 'Hello Tariq! Yes, we have iPhone 15 Pro Max 256GB available in Natural Titanium and Black Titanium. How many units are you looking for?', 'delivered', now() - INTERVAL '19 minutes'),
    ('d0000000-0000-0000-0000-000000000001', 'wamid.HBgLOTcxNTAxMjM0NTY3FQIAERgSMTFBMzQ0', 'inbound', 'customer', 'text', 'I need 50 pieces. What is the best wholesale price today?', 'read', now() - INTERVAL '16 minutes'),
    ('d0000000-0000-0000-0000-000000000001', 'wamid.HBgLOTcxNTAxMjM0NTY3FQIAERgSMTFBMzU1', 'outbound', 'ai', 'text', 'We have 50 units ready in our Deira warehouse at AED 3,850 each.', 'delivered', now() - INTERVAL '15 minutes')
ON CONFLICT (wa_message_id) DO NOTHING;

-- 4. Insert Sample Messages for Conversation 2 (Human Mode / Paused AI)
INSERT INTO messages (conversation_id, wa_message_id, direction, sender_type, type, body, status, created_at)
VALUES
    ('d0000000-0000-0000-0000-000000000002', 'wamid.HBgLOTY2NTA5ODc2NTQzFQIAERgSMTFBNTEw', 'inbound', 'customer', 'text', 'Can I negotiate the shipping rate for ORD-9812 to Riyadh?', 'read', now() - INTERVAL '1 hour 5 minutes'),
    ('d0000000-0000-0000-0000-000000000002', 'wamid.HBgLOTY2NTA5ODc2NTQzFQIAERgSMTFBNTIx', 'outbound', 'agent', 'text', 'Hello Sami, I am taking over this chat directly. For 100+ units, we can absorb 50% of the courier cargo cost to Riyadh.', 'delivered', now() - INTERVAL '40 minutes'),
    ('d0000000-0000-0000-0000-000000000002', 'wamid.HBgLOTY2NTA5ODc2NTQzFQIAERgSMTFBNTMz', 'inbound', 'customer', 'text', 'Please confirm bank transfer details for Phone Buzz FZCO.', 'delivered', now() - INTERVAL '5 minutes')
ON CONFLICT (wa_message_id) DO NOTHING;

-- 5. Insert n8n Chat History Memory compatibility records
INSERT INTO n8n_chat_histories (session_id, message)
VALUES
    ('971501234567', '{"type": "human", "data": {"content": "Hi PhoneBuzz, do you have iPhone 15 Pro Max 256GB available in stock?"}}'::jsonb),
    ('971501234567', '{"type": "ai", "data": {"content": "Hello Tariq! Yes, we have iPhone 15 Pro Max 256GB available in Natural Titanium and Black Titanium. How many units are you looking for?"}}'::jsonb),
    ('971501234567', '{"type": "human", "data": {"content": "I need 50 pieces. What is the best wholesale price today?"}}'::jsonb),
    ('971501234567', '{"type": "ai", "data": {"content": "We have 50 units ready in our Deira warehouse at AED 3,850 each."}}'::jsonb);
