create table if not exists checks (
  id bigserial primary key,
  service_id text not null,
  service_name text not null,
  checked_at timestamptz not null,
  status_code int not null,
  is_valid_check boolean not null default true,
  latency_ms numeric,
  agent text not null,
  region text not null,
  raw_row_hash text not null,
  uploaded_at timestamptz not null default now(),
  unique (service_id, checked_at, agent)
);

create index if not exists checks_checked_at_idx on checks (checked_at);
create index if not exists checks_service_id_idx on checks (service_id);
