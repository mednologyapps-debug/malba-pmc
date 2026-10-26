-- CMS PDF uploads are allowed up to 20 MB by the dashboard.
update storage.buckets
set file_size_limit = 20971520,
    updated_at = now()
where id = 'malba-cms';
