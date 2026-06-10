-- members-core.js reads/writes/updates a "reminders" table for user-created
-- maintenance reminders; the table never existed in production.

CREATE TABLE IF NOT EXISTS public.reminders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id    uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  title         text NOT NULL,
  reminder_type text NOT NULL DEFAULT 'maintenance',
  description   text,
  due_date      date,
  due_mileage   integer,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reminders_user_id_idx ON public.reminders (user_id);
CREATE INDEX IF NOT EXISTS reminders_vehicle_id_idx ON public.reminders (vehicle_id);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Member can read their own reminders
CREATE POLICY "reminders_select" ON public.reminders
  FOR SELECT USING (user_id = auth.uid());

-- Member can create reminders for themselves
CREATE POLICY "reminders_insert" ON public.reminders
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Member can update their own reminders (snooze, dismiss, edit)
CREATE POLICY "reminders_update" ON public.reminders
  FOR UPDATE USING (user_id = auth.uid());

-- Member can delete their own reminders
CREATE POLICY "reminders_delete" ON public.reminders
  FOR DELETE USING (user_id = auth.uid());
