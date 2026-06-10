-- custody_handoffs had only a SELECT policy; INSERT and UPDATE had no client-side
-- guard. The Netlify function (service_role) and SECURITY DEFINER RPCs bypass RLS
-- today, but a direct-client path would be silently blocked.
--
-- INSERT: any job party may create a handoff for that job.
-- UPDATE: only the handoff's own releasing or receiving party may update it
--         (covers accept/dispute status changes if ever called client-side).

CREATE POLICY "ch_insert" ON public.custody_handoffs
  FOR INSERT
  WITH CHECK (
    is_job_party(job_id, auth.uid())
    AND releasing_party_id = auth.uid()
  );

CREATE POLICY "ch_update" ON public.custody_handoffs
  FOR UPDATE
  USING (
    releasing_party_id = auth.uid()
    OR receiving_party_id = auth.uid()
  );
