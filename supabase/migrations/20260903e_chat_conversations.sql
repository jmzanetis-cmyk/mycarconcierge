-- ============================================================================
-- 20260903e — chat_conversations / chat_messages
--
-- Fixes two problems found while scoping "AI Chat Insights" (admin-portal
-- audit Tier 1 item that was never actually completed): the admin panel's
-- insights section was a permanent stub because there was genuinely no
-- server-side chat data anywhere to show — but investigating that surfaced
-- a real product bug, not just a dashboard gap: the live helpdesk chatbot
-- (www/helpdesk-widget.js — the driver/provider/education "Car Expert"
-- widget) has NO conversation memory in production. netlify/functions/
-- helpdesk.js never stored or replayed prior messages, so every message
-- was answered by Claude as an isolated single turn with zero context from
-- earlier in the same conversation, no matter how long the chat ran. All
-- chat state (messages, mode, thumbs up/down feedback) lived only in the
-- browser's localStorage (www/chat-widget-base.js), invisible to the
-- backend. Jordan's call (2026-09-03): fix the memory bug first — the
-- admin insights panel becomes a straightforward query once the data
-- actually exists server-side.
--
-- The helpdesk widget is used anonymously (no login/Supabase Auth session
-- involved anywhere in helpdesk-widget.js or helpdesk.js) — conversations
-- are keyed purely by the client-generated conversationId string
-- (`helpdesk-<timestamp>-<random>`, see chat-widget-base.js's constructor).
-- These tables follow that: conversation_id is a plain text primary key,
-- not a Supabase Auth user reference. No auth/identity redesign of the
-- chat feature was in scope for this fix.
--
-- feedback on chat_messages is a real column (up/down) so the schema is
-- ready for it, but www/chat-widget-base.js's thumbs up/down click handler
-- still only writes to localStorage (see its `mcc-chat-feedback` key) — it
-- was NOT wired to send feedback to the server in this pass, since doing
-- that requires matching a message to its server-side row (the widget only
-- tracks a local array index today) and was flagged as a separate,
-- deferrable follow-up rather than bundled into the memory-bug fix. Expect
-- the feedback column to read all-null until that follow-up ships.
--
-- RLS is enabled with no policies, same pattern as admin_team_members /
-- admin_team_invites (20260903a) — every access path here goes through a
-- Netlify function using the service-role key (helpdesk.js writes,
-- admin-chat-insights.js reads), which bypasses RLS entirely. No anon/
-- authenticated client should ever reach these tables directly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
  conversation_id  text PRIMARY KEY,
  mode             text NOT NULL CHECK (mode IN ('driver', 'provider', 'education')),
  message_count    int NOT NULL DEFAULT 0,
  started_at       timestamptz NOT NULL DEFAULT now(),
  last_message_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_conversations_last_message_at_idx ON chat_conversations(last_message_at DESC);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS chat_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  text NOT NULL REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text NOT NULL,
  feedback         text CHECK (feedback IN ('up', 'down')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_id_created_at_idx ON chat_messages(conversation_id, created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- End of 20260903e_chat_conversations.sql
-- ============================================================================
