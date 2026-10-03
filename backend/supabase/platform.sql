create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create type public.learning_status as enum ('locked', 'available', 'active', 'mastered');
create type public.message_role as enum ('user', 'assistant', 'system');
create type public.issue_kind as enum ('grammar', 'vocabulary', 'pronunciation', 'pragmatics');
create type public.review_rating as enum ('again', 'hard', 'good', 'easy');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  native_language text not null default 'zh-CN',
  target_language text not null default 'en-US',
  cefr_level text not null default 'A1',
  daily_goal_minutes integer not null default 20 check (daily_goal_minutes between 5 and 240),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learning_nodes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  cefr_level text not null,
  position integer not null unique,
  objectives jsonb not null default '[]'::jsonb,
  assessment_criteria jsonb not null default '{}'::jsonb,
  prerequisite_node_id uuid references public.learning_nodes(id),
  created_at timestamptz not null default now()
);

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  learning_node_id uuid not null references public.learning_nodes(id),
  title text not null,
  description text not null,
  cefr_level text not null,
  vocabulary jsonb not null default '[]'::jsonb,
  sentence_patterns jsonb not null default '[]'::jsonb,
  culture_notes jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 160),
  scene_key text not null check (char_length(scene_key) between 1 and 80),
  scene_id uuid references public.scenes(id),
  title text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  summary text,
  context_snapshot jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, client_id)
);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 160),
  role public.message_role not null,
  content text not null check (char_length(content) between 1 and 12000),
  translation text,
  correction jsonb,
  recalled_item_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (conversation_id, client_id)
);

create table public.learning_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  learning_node_id uuid not null references public.learning_nodes(id),
  scene_id uuid references public.scenes(id),
  status public.learning_status not null default 'available',
  completion numeric(5,2) not null default 0 check (completion between 0 and 100),
  mastery numeric(5,2) not null default 0 check (mastery between 0 and 100),
  recall_rate numeric(5,2) not null default 0 check (recall_rate between 0 and 100),
  learning_seconds integer not null default 0 check (learning_seconds >= 0),
  last_practiced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, learning_node_id, scene_id)
);

create table public.issue_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scene_id uuid references public.scenes(id),
  kind public.issue_kind not null,
  skill_key text not null,
  original_text text not null,
  suggested_text text not null,
  explanation text not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  severity smallint not null default 1 check (severity between 1 and 5),
  improving boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, kind, skill_key)
);

create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  issue_record_id uuid references public.issue_records(id) on delete set null,
  scene_id uuid references public.scenes(id),
  prompt text not null,
  answer text not null,
  context jsonb not null default '{}'::jsonb,
  interval_days integer not null default 0 check (interval_days >= 0),
  ease_factor numeric(4,2) not null default 2.50 check (ease_factor between 1.30 and 3.00),
  repetitions integer not null default 0 check (repetitions >= 0),
  due_at timestamptz not null default now(),
  last_rating public.review_rating,
  updated_at timestamptz not null default now()
);

create table public.shadowing_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scene_id uuid references public.scenes(id),
  sentence text not null,
  audio_path text,
  pronunciation_score numeric(5,2) check (pronunciation_score between 0 and 100),
  intonation_score numeric(5,2) check (intonation_score between 0 and 100),
  rhythm_score numeric(5,2) check (rhythm_score between 0 and 100),
  feedback jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.learning_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  scene_id uuid references public.scenes(id),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table public.learning_memory_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  device_id text not null check (char_length(device_id) between 1 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learning_memory_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('conversation', 'review', 'shadowing')),
  source_id text not null check (char_length(source_id) between 1 and 160),
  scene_id text not null check (char_length(scene_id) between 1 and 80),
  memory_kind text not null check (
    memory_kind in ('successful_expression', 'correction', 'review', 'pronunciation')
  ),
  content text not null check (char_length(content) between 1 and 6000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  strength smallint not null default 50 check (strength between 0 and 100),
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_type, source_id)
);

create table public.expression_library_items (
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

create table public.account_deletion_audits (
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

create table public.rate_limit_buckets (
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

create index conversations_user_recent_idx
  on public.conversations (user_id, last_message_at desc);
create index conversations_user_scene_recent_idx
  on public.conversations (user_id, scene_key, last_message_at desc);
create index messages_conversation_created_idx
  on public.conversation_messages (conversation_id, created_at);
create index progress_user_status_idx
  on public.learning_progress (user_id, status);
create index issues_user_priority_idx
  on public.issue_records (user_id, severity desc, occurrence_count desc);
create index review_user_due_idx
  on public.review_items (user_id, due_at);
create index events_user_occurred_idx
  on public.learning_events (user_id, occurred_at desc);
create index memory_snapshots_updated_idx
  on public.learning_memory_snapshots (updated_at desc);
create index learning_memory_documents_user_scene_idx
  on public.learning_memory_documents (user_id, scene_id, updated_at desc);
create index learning_memory_documents_embedding_idx
  on public.learning_memory_documents
  using hnsw (embedding extensions.vector_cosine_ops);
create index expression_library_items_user_category_idx
  on public.expression_library_items (user_id, scene_category, updated_at desc);

alter table public.profiles enable row level security;
alter table public.learning_nodes enable row level security;
alter table public.scenes enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.learning_progress enable row level security;
alter table public.issue_records enable row level security;
alter table public.review_items enable row level security;
alter table public.shadowing_attempts enable row level security;
alter table public.learning_events enable row level security;
alter table public.learning_memory_snapshots enable row level security;
alter table public.learning_memory_documents enable row level security;
alter table public.expression_library_items enable row level security;
alter table public.account_deletion_audits enable row level security;
alter table public.rate_limit_buckets enable row level security;

create policy "authenticated users read learning nodes"
  on public.learning_nodes for select to authenticated using (true);
create policy "authenticated users read published scenes"
  on public.scenes for select to authenticated using (published);

create policy "users manage own profile"
  on public.profiles for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "users manage own conversations"
  on public.conversations for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
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
create policy "users manage own progress"
  on public.learning_progress for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "users manage own issues"
  on public.issue_records for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "users manage own review items"
  on public.review_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "users manage own shadowing attempts"
  on public.shadowing_attempts for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "users manage own learning events"
  on public.learning_events for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "users manage own learning memory"
  on public.learning_memory_snapshots for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "users manage own long term memory"
  on public.learning_memory_documents for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "users manage own expression library"
  on public.expression_library_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

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
revoke all on table public.rate_limit_buckets from anon, authenticated;
grant select, insert, update, delete on table public.rate_limit_buckets to service_role;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger progress_touch_updated_at
before update on public.learning_progress
for each row execute function public.touch_updated_at();

create trigger review_items_touch_updated_at
before update on public.review_items
for each row execute function public.touch_updated_at();

create trigger learning_memory_snapshots_touch_updated_at
before update on public.learning_memory_snapshots
for each row execute function public.touch_updated_at();

create trigger learning_memory_documents_touch_updated_at
before update on public.learning_memory_documents
for each row execute function public.touch_updated_at();

create trigger expression_library_items_touch_updated_at
before update on public.expression_library_items
for each row execute function public.touch_updated_at();

create or replace function public.check_rate_limit(
  p_bucket text
)
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

create or replace function public.sync_learning_memory(
  p_state jsonb,
  p_expected_revision bigint,
  p_device_id text
)
returns table (
  state jsonb,
  revision bigint,
  updated_at timestamptz,
  device_id text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;
  if jsonb_typeof(p_state) <> 'object' then
    raise exception 'learning memory state must be a JSON object';
  end if;
  if char_length(p_device_id) < 1 or char_length(p_device_id) > 128 then
    raise exception 'invalid device id';
  end if;

  insert into public.learning_memory_snapshots (
    user_id,
    state,
    revision,
    device_id
  )
  values (
    current_user_id,
    p_state,
    1,
    p_device_id
  )
  on conflict (user_id) do nothing;

  if not found then
    update public.learning_memory_snapshots as snapshot
    set
      state = p_state,
      revision = snapshot.revision + 1,
      device_id = p_device_id
    where snapshot.user_id = current_user_id
      and snapshot.revision = p_expected_revision;
  end if;

  return query
  select
    snapshot.state,
    snapshot.revision,
    snapshot.updated_at,
    snapshot.device_id
  from public.learning_memory_snapshots as snapshot
  where snapshot.user_id = current_user_id;
end;
$$;

revoke execute on function public.sync_learning_memory(jsonb, bigint, text) from public, anon;
grant execute on function public.sync_learning_memory(jsonb, bigint, text) to authenticated;

create or replace function public.match_long_term_memories(
  p_query_embedding extensions.vector(1536),
  p_scene_id text,
  p_match_count integer default 5,
  p_min_similarity real default 0.2
)
returns table (
  id uuid,
  content text,
  scene_id text,
  memory_kind text,
  strength smallint,
  metadata jsonb,
  similarity real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    memory.id,
    memory.content,
    memory.scene_id,
    memory.memory_kind,
    memory.strength,
    memory.metadata,
    (1 - (memory.embedding OPERATOR(extensions.<=>) p_query_embedding))::real as similarity
  from public.learning_memory_documents as memory
  where memory.user_id = (select auth.uid())
    and (1 - (memory.embedding OPERATOR(extensions.<=>) p_query_embedding)) >= p_min_similarity
  order by
    (
      memory.scene_id = p_scene_id
      or memory.metadata -> 'targetSceneIds' ? p_scene_id
    ) desc,
    memory.embedding OPERATOR(extensions.<=>) p_query_embedding,
    memory.strength asc,
    memory.updated_at desc
  limit least(greatest(p_match_count, 1), 8);
$$;

revoke execute on function public.match_long_term_memories(
  extensions.vector,
  text,
  integer,
  real
) from public, anon;
grant execute on function public.match_long_term_memories(
  extensions.vector,
  text,
  integer,
  real
) to authenticated;

alter table public.learning_memory_snapshots replica identity full;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'learning_memory_snapshots'
  ) then
    alter publication supabase_realtime add table public.learning_memory_snapshots;
  end if;
end;
$$;
