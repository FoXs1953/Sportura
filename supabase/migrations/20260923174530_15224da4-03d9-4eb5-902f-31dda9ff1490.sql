DROP POLICY IF EXISTS profiles_public_read ON public.profiles;
CREATE POLICY profiles_select_scoped ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id OR public.is_admin()
  OR EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.user_id = profiles.id AND public.is_activity_host(r.activity_id, auth.uid()))
);

DROP POLICY IF EXISTS reviews_public_read ON public.reviews;
CREATE POLICY reviews_select_scoped ON public.reviews FOR SELECT TO authenticated
USING (auth.uid() = reviewer_id OR auth.uid() = reviewed_user_id OR public.is_admin());

DROP POLICY IF EXISTS results_public_read ON public.results;
CREATE POLICY results_select_scoped ON public.results FOR SELECT TO anon, authenticated
USING (
  EXISTS (SELECT 1 FROM public.activities a WHERE a.id = results.activity_id AND a.is_private = false)
  OR public.is_activity_host(activity_id, auth.uid())
  OR public.is_admin()
);

DROP POLICY IF EXISTS site_settings_public_read ON public.site_settings;
CREATE POLICY site_settings_select_scoped ON public.site_settings FOR SELECT TO anon, authenticated
USING (key IN ('general','catalog','business') OR public.is_admin());

DROP POLICY IF EXISTS avatars_select_authenticated ON storage.objects;
CREATE POLICY avatars_select_own ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));