-- New Supabase projects don't auto-grant table access. Grant it explicitly;
-- row level security policies still decide which rows each person can see.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function
  public.create_circle(text), public.create_invite(uuid), public.join_circle(text), public.circle_preview(text),
  public.remove_member(uuid, uuid), public.new_owntracks_token(), public.delete_my_history(), public.delete_my_account()
  to authenticated;
grant execute on function public.owntracks_check(uuid, text) to service_role;
-- strangers (not signed in) get nothing
revoke all on all tables in schema public from anon;
