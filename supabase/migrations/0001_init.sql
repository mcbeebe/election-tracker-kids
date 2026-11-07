-- 0001_init: core results schema (PLAN.md §5).
-- Race ids are namespaced by source ("civicapi:87162") so future providers cannot collide.
-- RLS is enabled with no policies: only the service role (server-side) can read or write.

create table if not exists races (
  id            text primary key,
  source        text not null,
  chamber       text not null check (chamber in ('senate', 'house', 'governor', 'measures')),
  kind          text not null default 'seat' check (kind in ('seat', 'national_aggregate')),
  state         char(2) not null,
  district      text,
  name          text not null,
  election_type text,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now()
);

create table if not exists candidates (
  race_id      text not null references races (id) on delete cascade,
  candidate_id text not null,
  name         text not null,
  party        text not null,
  color        text not null,
  incumbent    boolean,
  primary key (race_id, candidate_id)
);

create table if not exists snapshots (
  id                bigserial primary key,
  race_id           text not null references races (id) on delete cascade,
  source            text not null,
  captured_at       timestamptz not null,
  percent_reporting numeric(6, 3) not null,
  payload           jsonb not null -- { totalVotes, candidates: NormalizedCandidate[] }
);

create table if not exists overrides (
  race_id             text primary key references races (id) on delete cascade,
  status              text not null check (status in ('called', 'uncalled', 'disputed')),
  winner_candidate_id text,
  note                text,
  set_at              timestamptz not null default now(),
  check (status <> 'called' or winner_candidate_id is not null)
);

create table if not exists provider_health (
  source     text not null,
  checked_at timestamptz not null default now(),
  ok         boolean not null,
  latency_ms integer,
  error      text
);

create index if not exists snapshots_race_captured_idx on snapshots (race_id, captured_at desc);
create index if not exists races_chamber_state_idx on races (chamber, state);
create index if not exists provider_health_source_checked_idx on provider_health (source, checked_at desc);

alter table races enable row level security;
alter table candidates enable row level security;
alter table snapshots enable row level security;
alter table overrides enable row level security;
alter table provider_health enable row level security;
