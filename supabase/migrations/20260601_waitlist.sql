-- Pre-launch waitlist for interest capture (Run Sequence Step 6)
CREATE TABLE IF NOT EXISTS public.waitlist (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  email         text        NOT NULL,
  intended_role text        NOT NULL CHECK (intended_role IN ('member', 'provider')),
  zip_code      text,
  source        text        NOT NULL DEFAULT 'landing_page',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique on email
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_lower_idx ON public.waitlist (lower(email));

-- RLS on, no policies — only service_role can access rows
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
