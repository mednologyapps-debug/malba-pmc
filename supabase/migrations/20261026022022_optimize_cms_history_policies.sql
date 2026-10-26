-- Avoid evaluating auth.jwt() once per row in the CMS history policies.
drop policy if exists cms_history_admin_read on public.cms_history;
create policy cms_history_admin_read on public.cms_history for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists cms_history_admin_write on public.cms_history;
create policy cms_history_admin_write on public.cms_history for insert to authenticated
with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
