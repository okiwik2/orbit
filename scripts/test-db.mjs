import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';

const db = new PGlite({ extensions: { pgcrypto } });
const migration = readFileSync(process.argv[2] ?? 'supabase/migrations/20261118000000_orbit_schema.sql', 'utf8')
  .replace(/create extension if not exists pgcrypto with schema extensions;/, 'create schema extensions; create extension pgcrypto schema extensions;')
  .replace(/create extension if not exists pg_net[^;]*;/, '')
  .replace(/create extension if not exists pg_cron;/, '');

// Supabase stand-ins
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'sub', '')::uuid $$;
create schema net;
create table net.log (id serial, url text, body jsonb);
create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}') returns bigint language sql as $$
  insert into net.log (url, body) values (url, body) returning id $$;
create schema cron;
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ select 1::bigint $$;
create publication supabase_realtime;
`);
await db.exec(migration);
await db.exec(`
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
insert into private.config values ('notify_url','https://x/functions/v1/notify'),('notify_secret','s');
`);
console.log('migration OK');

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
const as = async (uid, sql, params) => {
  await db.exec(`set role authenticated; set request.jwt.claims = '{"sub":"${uid}"}';`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec(`reset role; set request.jwt.claims = '';`); }
};
let fails = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };

await db.exec(`insert into auth.users values ('${A}','alice@x.nz'),('${B}','bob@x.nz'),('${C}','carol@x.nz')`);
check('profiles auto-created', (await db.query('select count(*)::int n from public.profiles')).rows[0].n === 3);

const cid = (await as(A, `select public.create_circle('Family') id`))[0].id;
const code = (await as(A, `select public.create_invite($1) c`, [cid]))[0].c;
check('invite code 8 chars', code.length === 8);
check('preview works for outsider', (await as(B, `select * from public.circle_preview($1)`, [code]))[0]?.name === 'Family');
await as(B, `select public.join_circle($1)`, [code]);
check('B joined', (await as(B, `select count(*)::int n from public.circle_members where circle_id=$1`, [cid]))[0].n === 2);
check('join message posted', (await as(A, `select count(*)::int n from public.messages where kind='system'`))[0].n === 1);

// places + geofence
await as(A, `insert into public.places (circle_id,name,kind,lat,lng,radius_m) values ($1,'Home','home',-36.85,174.76,150)`, [cid]);
await as(B, `insert into public.locations_latest (user_id,lat,lng,battery) values ($1,-36.86,174.76,0.5)`, [B]); // ~1.1 km away
await as(B, `update public.locations_latest set lat=-36.8501, lng=174.7601, recorded_at=now() where user_id=$1`, [B]);
const ev = await as(A, `select kind from public.place_events`);
check('arrival event', ev.length === 1 && ev[0].kind === 'arrive');
const pushes = (await db.query(`select body from net.log`)).rows;
check('arrival push to A only', pushes.some((p) => p.body.title === 'bob arrived at Home' && p.body.recipients.includes(A) && !p.body.recipients.includes(B)));
await as(B, `update public.locations_latest set lat=-36.8505 where user_id=$1`, [B]); // jitter inside radius+60
check('no flapping', (await as(A, `select count(*)::int n from public.place_events`))[0].n === 1);
await as(B, `update public.locations_latest set lat=-36.86 where user_id=$1`, [B]);
check('leave event', (await as(A, `select count(*)::int n from public.place_events where kind='leave'`))[0].n === 1);

// low battery
await db.exec('truncate net.log');
await as(B, `update public.locations_latest set battery=0.12, charging=false where user_id=$1`, [B]);
await as(B, `update public.locations_latest set battery=0.10 where user_id=$1`, [B]);
const bat = (await db.query(`select body from net.log where body->>'title' like '%battery%'`)).rows;
check('low battery alert once', bat.length === 1);

// privacy
check('A sees B location', (await as(A, `select count(*)::int n from public.locations_latest`))[0].n === 1);
check('C sees no locations', (await as(C, `select count(*)::int n from public.locations_latest`))[0].n === 0);
check('C sees no history', (await as(C, `select count(*)::int n from public.location_history`))[0].n === 0);
check('C sees no circles', (await as(C, `select count(*)::int n from public.circles`))[0].n === 0);
check('C sees no profiles of others', (await as(C, `select count(*)::int n from public.profiles`))[0].n === 1);
await as(B, `update public.circle_members set paused_until = now() + interval '1 hour' where user_id=$1`, [B]);
check('pause hides B', (await as(A, `select count(*)::int n from public.locations_latest`))[0].n === 0);
check('pause hides history', (await as(A, `select count(*)::int n from public.location_history`))[0].n === 0);
let spoof = false;
try { await as(C, `insert into public.locations_latest (user_id,lat,lng) values ($1,0,0)`, [A]); spoof = true; } catch {}
check('cannot write someone else location', !spoof);
let sneaky = false;
try { await as(C, `insert into public.messages (circle_id,user_id,body) values ($1,$2,'hi')`, [cid, C]); sneaky = true; } catch {}
check('outsider cannot post in circle', !sneaky);
let sysmsg = false;
try { await as(A, `insert into public.messages (circle_id,user_id,kind,body) values ($1,$2,'sos','fake')`, [cid, A]); sysmsg = true; } catch {}
check('cannot fake SOS message', !sysmsg);
check('settings private', (await as(A, `select count(*)::int n from public.user_settings`))[0].n === 1);
let removeOther = false;
try { await as(B, `select public.remove_member($1,$2)`, [cid, A]); removeOther = true; } catch {}
check('non-admin cannot remove others', !removeOther);
let xss = false;
try { await as(A, `update public.profiles set emoji='<img>' where id=$1`, [A]); xss = true; } catch {}
check('emoji html rejected', !xss);

// SOS
await db.exec('truncate net.log');
await as(A, `insert into public.sos_alerts (user_id,lat,lng) values ($1,-36.85,174.76)`, [A]);
check('SOS push to B', (await db.query(`select body from net.log`)).rows.some((r) => r.body.title.startsWith('🚨') && r.body.recipients.includes(B)));
check('SOS chat message', (await as(B, `select count(*)::int n from public.messages where kind='sos'`))[0].n === 1);
check('B sees SOS', (await as(B, `select count(*)::int n from public.sos_alerts where status='active'`))[0].n === 1);
await as(A, `insert into public.sos_alerts (user_id,status,reason,fire_at) values ($1,'pending','crash',now())`, [A]);
await db.exec(`update public.sos_alerts set status='active' where status='pending' and fire_at<=now()`); // the cron job
check('crash fires after grace', (await db.query(`select count(*)::int n from net.log where body->>'body' like 'Possible crash%'`)).rows[0].n === 1);

// ETA auto-end
await db.exec(`update public.circle_members set paused_until=null`);
await as(B, `insert into public.eta_shares (user_id,circle_id,dest_name,dest_lat,dest_lng) values ($1,$2,'Home',-36.85,174.76)`, [B, cid]);
await as(B, `update public.locations_latest set lat=-36.8501, lng=174.7601 where user_id=$1`, [B]);
check('ETA ends on arrival', (await as(A, `select count(*)::int n from public.eta_shares where active`))[0].n === 0);

// OwnTracks token
const tok = (await as(B, `select public.new_owntracks_token() t`))[0].t;
check('owntracks token valid', (await db.query(`select public.owntracks_check($1,$2) ok`, [B, tok])).rows[0].ok === true);
check('owntracks wrong token rejected', (await db.query(`select public.owntracks_check($1,'nope') ok`, [B])).rows[0].ok === false);

// reminders on arrival
await db.exec('truncate net.log');
const pid = (await as(A, `select id from public.places limit 1`))[0].id;
await as(A, `insert into public.reminders (circle_id,place_id,body) values ($1,$2,'Take out bins')`, [cid, pid]);
await as(B, `update public.locations_latest set lat=-36.86 where user_id=$1`, [B]);
await as(B, `update public.locations_latest set lat=-36.8501 where user_id=$1`, [B]);
check('reminder pushed on arrival', (await db.query(`select count(*)::int n from net.log where body->>'body'='Take out bins'`)).rows[0].n === 1);

// HA webhook
await db.exec('truncate net.log');
await as(B, `update public.user_settings set ha_webhook_url='https://ha.example/api/webhook/x' where user_id=$1`, [B]);
await as(B, `update public.locations_latest set lat=-36.86 where user_id=$1`, [B]);
check('HA webhook on leaving home', (await db.query(`select count(*)::int n from net.log where url like 'https://ha.example%'`)).rows[0].n === 1);

// deletion
await as(B, `select public.delete_my_history()`);
check('history deleted', (await db.query(`select count(*)::int n from public.location_history where user_id=$1`, [B])).rows[0].n === 0);
await as(C, `select public.delete_my_account()`);
check('account deleted', (await db.query(`select count(*)::int n from auth.users where id=$1`, [C])).rows[0].n === 0);

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
