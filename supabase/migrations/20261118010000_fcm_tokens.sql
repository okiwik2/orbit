-- Android push now goes directly through Firebase Cloud Messaging.
alter table public.push_tokens drop constraint push_tokens_kind_check;
alter table public.push_tokens add constraint push_tokens_kind_check check (kind in ('expo','web','fcm'));
