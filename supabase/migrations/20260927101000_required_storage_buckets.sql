-- Keep file storage reproducible on independently provisioned projects.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES
  ('avatars','avatars',false,5242880,ARRAY['image/jpeg','image/png','image/webp']),
  ('receipts','receipts',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT(id) DO NOTHING;
