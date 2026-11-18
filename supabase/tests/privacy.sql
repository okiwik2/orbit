-- Privacy checks. Run in the SQL Editor of a TEST project (it creates and removes fake users).
-- Expect every line of output to say PASS.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.local');
insert into public.circles (id, name, created_by) values ('10000000-0000-0000-0000-000000000001', 'AB', '00000000-0000-0000-0000-00000000000a');
insert into public.circle_members (circle_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'member');
insert into public.locations_latest (user_id, lat, lng) values ('00000000-0000-0000-0000-00000000000a', -36.85, 174.76);

set local role authenticated;
-- B shares a circle with A → sees A
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select case when count(*) = 1 then 'PASS member sees location' else 'FAIL member sees location' end from public.locations_latest;
-- C is a stranger → sees nothing
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select case when count(*) = 0 then 'PASS stranger sees nothing' else 'FAIL stranger sees location' end from public.locations_latest;
select case when count(*) = 0 then 'PASS stranger sees no circle' else 'FAIL stranger sees circle' end from public.circles;
-- A pauses → B no longer sees A
reset role;
update public.circle_members set paused_until = now() + interval '1 hour' where user_id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select case when count(*) = 0 then 'PASS paused is hidden' else 'FAIL paused still visible' end from public.locations_latest;
rollback;
