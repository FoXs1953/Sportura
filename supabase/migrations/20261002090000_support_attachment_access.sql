-- A support reply may contain a file uploaded by staff. The ticket owner can
-- read that file only after it has been attached to their own conversation.
DROP POLICY IF EXISTS support_read ON storage.objects;
CREATE POLICY support_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'support'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.support_messages m
      JOIN public.support_tickets t ON t.id = m.ticket_id
      WHERE t.user_id = auth.uid() AND storage.objects.name = ANY(m.attachments)
    )
  )
);
