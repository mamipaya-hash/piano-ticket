create table if not exists public.app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  studio_name text not null default 'freelyピアノ教室',
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  fee integer not null default 0,
  order_index integer not null default 0
);

create table if not exists public.students (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  grade text not null default '',
  course_id text not null,
  lesson_day text not null default '月',
  start_time text not null default '15:00',
  fee integer not null default 0,
  receipt_checked boolean not null default false,
  receipt_date date,
  receipt_memo text not null default '',
  receipt_items jsonb not null default '[]'::jsonb,
  studio_notice text not null default '',
  teacher_memo text not null default '',
  order_index integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
alter table public.courses enable row level security;
alter table public.students enable row level security;

drop policy if exists "teacher can manage own settings" on public.app_settings;
drop policy if exists "teacher can manage own courses" on public.courses;
drop policy if exists "teacher can manage own students" on public.students;

create policy "teacher can manage own settings"
on public.app_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "teacher can manage own courses"
on public.courses
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "teacher can manage own students"
on public.students
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists courses_user_id_order_index_idx on public.courses(user_id, order_index);
create index if not exists students_user_id_order_index_idx on public.students(user_id, order_index);
