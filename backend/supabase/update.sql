alter table public.conversations
  add column if not exists client_id text,
  add column if not exists scene_key text;

alter table public.conversation_messages
  add column if not exists client_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_client_id_length'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_client_id_length
      check (client_id is null or char_length(client_id) between 1 and 160);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_scene_key_length'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_scene_key_length
      check (scene_key is null or char_length(scene_key) between 1 and 80);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversation_messages_client_id_length'
      and conrelid = 'public.conversation_messages'::regclass
  ) then
    alter table public.conversation_messages
      add constraint conversation_messages_client_id_length
      check (client_id is null or char_length(client_id) between 1 and 160);
  end if;
end;
$$;

-- 长期向量记忆新增表达学习来源。既有实例的约束名由内联 check 自动生成，
-- 这里显式重命名以便两套 SQL 指向同一个约束，重复执行保持幂等。
alter table public.learning_memory_documents
  drop constraint if exists learning_memory_documents_source_type_check;
alter table public.learning_memory_documents
  add constraint learning_memory_documents_source_type_check
  check (source_type in ('conversation', 'review', 'shadowing', 'expression'));

alter table public.learning_memory_documents
  drop constraint if exists learning_memory_documents_memory_kind_check;
alter table public.learning_memory_documents
  add constraint learning_memory_documents_memory_kind_check
  check (
    memory_kind in (
      'successful_expression',
      'correction',
      'review',
      'pronunciation',
      'expression_library'
    )
  );

create unique index if not exists conversations_user_client_id_idx
  on public.conversations (user_id, client_id);
create index if not exists conversations_user_scene_recent_idx
  on public.conversations (user_id, scene_key, last_message_at desc);
create unique index if not exists conversation_messages_conversation_client_id_idx
  on public.conversation_messages (conversation_id, client_id);

drop policy if exists "users manage own messages"
  on public.conversation_messages;
create policy "users manage own messages"
  on public.conversation_messages for all to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.conversations
      where conversations.id = conversation_messages.conversation_id
        and conversations.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.conversations
      where conversations.id = conversation_messages.conversation_id
        and conversations.user_id = (select auth.uid())
    )
  );

create table if not exists public.account_deletion_audits (
  id uuid primary key default gen_random_uuid(),
  user_fingerprint text not null check (char_length(user_fingerprint) = 64),
  status text not null default 'started' check (
    status in ('started', 'completed', 'residual_data', 'failed')
  ),
  vector_documents_before integer not null default 0 check (vector_documents_before >= 0),
  residual_counts jsonb not null default '{}'::jsonb check (
    jsonb_typeof(residual_counts) = 'object'
  ),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.account_deletion_audits enable row level security;

create table if not exists public.expression_library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 160),
  phrase text not null check (char_length(phrase) between 1 and 120),
  normalized_phrase text generated always as (lower(btrim(phrase))) stored,
  meaning text not null check (char_length(meaning) between 1 and 500),
  reasoning text not null check (char_length(reasoning) between 1 and 1000),
  origin_note text not null check (char_length(origin_note) between 1 and 1000),
  example text not null check (char_length(example) between 1 and 500),
  context text not null check (context in ('日常', '职场', '通用')),
  kind text not null check (
    kind in ('idiom', 'collocation', 'phrasal-verb', 'sentence-pattern')
  ),
  scene_category text not null check (
    scene_category in (
      'clothing',
      'dining',
      'housing',
      'transport',
      'work',
      'social',
      'health',
      'services',
      'learning',
      'emergency'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id),
  unique (user_id, scene_category, normalized_phrase)
);
create index if not exists expression_library_items_user_category_idx
  on public.expression_library_items (user_id, scene_category, updated_at desc);
alter table public.expression_library_items enable row level security;
drop policy if exists "users manage own expression library"
  on public.expression_library_items;
create policy "users manage own expression library"
  on public.expression_library_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop trigger if exists expression_library_items_touch_updated_at
  on public.expression_library_items;
create trigger expression_library_items_touch_updated_at
before update on public.expression_library_items
for each row execute function public.touch_updated_at();

revoke all on all tables in schema public from anon;
grant select on table public.learning_nodes, public.scenes to authenticated;
grant select, insert, update, delete on table
  public.profiles,
  public.conversations,
  public.conversation_messages,
  public.learning_progress,
  public.issue_records,
  public.review_items,
  public.shadowing_attempts,
  public.learning_events,
  public.learning_memory_snapshots,
  public.learning_memory_documents,
  public.expression_library_items
to authenticated;
revoke all on all sequences in schema public from anon;
grant usage, select on all sequences in schema public to authenticated;
revoke all on table public.account_deletion_audits from anon, authenticated;
grant select, insert, update on table public.account_deletion_audits to service_role;

create table if not exists public.rate_limit_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (
    bucket in (
      'account-delete',
      'account-export',
      'conversation-generate',
      'conversation-sync',
      'expression-library',
      'memory-document',
      'rls-validation',
      'translation'
    )
  ),
  request_count integer not null default 0 check (request_count >= 0),
  window_started_at timestamptz not null default now(),
  primary key (user_id, bucket)
);
alter table public.rate_limit_buckets enable row level security;
alter table public.rate_limit_buckets
  drop constraint if exists rate_limit_buckets_bucket_check;
alter table public.rate_limit_buckets
  add constraint rate_limit_buckets_bucket_check
  check (
    bucket in (
      'account-delete',
      'account-export',
      'conversation-generate',
      'conversation-sync',
      'expression-library',
      'memory-document',
      'rls-validation',
      'translation'
    )
  );
revoke all on table public.rate_limit_buckets from anon, authenticated;
grant select, insert, update, delete on table public.rate_limit_buckets to service_role;

drop function if exists public.check_rate_limit(text, integer, integer);

create or replace function public.check_rate_limit(p_bucket text)
returns table (
  limited boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_time timestamptz := clock_timestamp();
  bucket_limit integer;
  window_seconds integer;
  result_count integer;
  result_window_started_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;
  if p_bucket not in (
    'account-delete',
    'account-export',
    'conversation-generate',
    'conversation-sync',
    'expression-library',
    'memory-document',
    'rls-validation',
    'translation'
  ) then
    raise exception 'invalid rate limit bucket';
  end if;

  select
    case p_bucket
      when 'account-delete' then 5
      when 'account-export' then 10
      when 'conversation-generate' then 20
      when 'conversation-sync' then 120
      when 'expression-library' then 120
      when 'memory-document' then 60
      when 'rls-validation' then 2
      when 'translation' then 30
    end,
    case
      when p_bucket in ('account-delete', 'account-export') then 3600
      when p_bucket = 'rls-validation' then 1
      else 60
    end
  into bucket_limit, window_seconds;

  insert into public.rate_limit_buckets as rate_limit (
    user_id,
    bucket,
    request_count,
    window_started_at
  )
  values (
    current_user_id,
    p_bucket,
    1,
    request_time
  )
  on conflict (user_id, bucket) do update
  set
    request_count = case
      when rate_limit.window_started_at + make_interval(secs => window_seconds) <= request_time
        then 1
      else least(rate_limit.request_count + 1, bucket_limit + 1)
    end,
    window_started_at = case
      when rate_limit.window_started_at + make_interval(secs => window_seconds) <= request_time
        then request_time
      else rate_limit.window_started_at
    end
  returning request_count, window_started_at
  into result_count, result_window_started_at;

  return query
  select
    result_count > bucket_limit,
    greatest(bucket_limit - result_count, 0),
    result_window_started_at + make_interval(secs => window_seconds);
end;
$$;

revoke execute on function public.check_rate_limit(text)
  from public, anon;
grant execute on function public.check_rate_limit(text)
  to authenticated;
