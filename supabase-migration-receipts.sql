alter table public.students
add column if not exists receipt_items jsonb not null default '[]'::jsonb;
