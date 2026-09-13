-- Step 15 (V2 Step 10): propose-and-approve rule changes, plus notifications
-- (docs/PLAN-V2.md §2, §3.4).
-- Run once via `node scripts/run-sql.mjs supabase/step15_change_requests.sql`.
--
-- The whole point: once a challenge is active, nobody can unilaterally change
-- its rules (challenge_rules' own RLS only lets created_by insert while
-- status='draft' — see step12_challenges.sql). A change now goes through a
-- challenge_change_requests row that the OTHER participant must approve, and
-- approval is the only path that's allowed to insert a replacement rule after
-- activation. Anti-cheat rule #1 still holds: the new rule always starts
-- tomorrow (effective_from = current_date + 1), never today, so nobody can
-- see a bad score and fix it retroactively.
--
-- notifications is the generic inbox from the §2 sketch. This step is its
-- first (and so far only) writer: propose/respond insert a row for whichever
-- side didn't just act, and the tab bar's unread dot (client-side) is driven
-- by a plain count of user_id = auth.uid() and read_at is null.

-- ---------------------------------------------------------------------------
-- 1. challenge_change_requests
-- ---------------------------------------------------------------------------
-- kind='add': rule_id is null, payload.rule is the new RuleInput-shaped rule.
-- kind='edit'|'remove': rule_id points at the live rule being replaced/closed;
-- 'edit' also carries payload.rule (the replacement). payload.ownTarget is the
-- PROPOSER's own number when the (new) rule is scope='own' — the responder's
-- own number is supplied separately, as an argument to respond_challenge_change,
-- mirroring how accept_challenge_invite takes the joiner's own targets.

create table if not exists public.challenge_change_requests (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  kind text not null check (kind in ('add', 'edit', 'remove')),
  rule_id uuid references public.challenge_rules (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  proposed_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  responded_by uuid references auth.users (id) on delete set null,
  responded_at timestamptz,
  -- Set on approval: current_date + 1, the day the replacement/new rule
  -- actually starts scoring.
  effective_from date,
  created_at timestamptz not null default now(),
  check (kind = 'add' or rule_id is not null),
  check (kind <> 'add' or rule_id is null)
);

create index if not exists challenge_change_requests_challenge
  on public.challenge_change_requests (challenge_id);

alter table public.challenge_change_requests enable row level security;

create policy "Participants can view change requests"
  on public.challenge_change_requests for select
  using (public.is_challenge_participant(challenge_id));

-- No insert/update policy: every write goes through the two security-definer
-- functions below, which validate "not your own proposal" and perform the
-- rule mutation atomically with recording the response — exactly the kind of
-- multi-table transaction a plain RLS policy can't express, same reasoning as
-- accept_challenge_invite in step13_challenge_invites.sql.

-- ---------------------------------------------------------------------------
-- 2. notifications
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread
  on public.notifications (user_id, read_at);

alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "Users can mark their own notifications read"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No insert policy for plain users: only propose_challenge_change and
-- respond_challenge_change write these, for whichever side didn't just act.

-- ---------------------------------------------------------------------------
-- 3. propose_challenge_change
-- ---------------------------------------------------------------------------

create or replace function public.propose_challenge_change(
  p_challenge_id uuid,
  p_kind text,
  p_rule_id uuid,
  p_rule jsonb,
  p_own_target jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_challenge public.challenges%rowtype;
  v_request_id uuid;
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_kind not in ('add', 'edit', 'remove') then
    raise exception 'Invalid change kind.' using errcode = 'P0001';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id;
  if not found then
    raise exception 'Challenge not found.' using errcode = 'P0002';
  end if;
  if not public.is_challenge_participant(p_challenge_id) then
    raise exception 'Not a participant.' using errcode = '42501';
  end if;
  if v_challenge.status <> 'active' then
    raise exception 'This challenge is not active yet.' using errcode = 'P0001';
  end if;

  if p_kind in ('edit', 'remove') then
    if p_rule_id is null then
      raise exception 'A rule id is required.' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.challenge_rules r
      where r.id = p_rule_id and r.challenge_id = p_challenge_id and r.effective_to is null
    ) then
      raise exception 'That rule is not currently active.' using errcode = 'P0001';
    end if;
  elsif p_rule_id is not null then
    raise exception 'Adding a rule takes no rule id.' using errcode = 'P0001';
  end if;

  if p_kind in ('add', 'edit') and p_rule is null then
    raise exception 'A rule is required.' using errcode = 'P0001';
  end if;
  if p_kind = 'add' and exists (
    select 1 from public.challenge_rules r
    where r.challenge_id = p_challenge_id
      and r.metric_key = (p_rule ->> 'metricKey')
      and r.effective_to is null
  ) then
    raise exception 'This challenge already has a live rule for that metric.' using errcode = 'P0001';
  end if;

  insert into public.challenge_change_requests (challenge_id, kind, rule_id, payload, proposed_by)
  values (
    p_challenge_id,
    p_kind,
    p_rule_id,
    jsonb_build_object('rule', p_rule, 'ownTarget', p_own_target),
    v_uid
  )
  returning id into v_request_id;

  for v_other in
    select cp.user_id from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id and cp.user_id <> v_uid and cp.status = 'accepted'
  loop
    insert into public.notifications (user_id, kind, payload)
    values (
      v_other,
      'change_proposed',
      jsonb_build_object(
        'requestId', v_request_id,
        'challengeId', p_challenge_id,
        'challengeName', v_challenge.name,
        'kind', p_kind
      )
    );
  end loop;

  return v_request_id;
end;
$$;

grant execute on function public.propose_challenge_change(uuid, text, uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. respond_challenge_change
-- ---------------------------------------------------------------------------
-- p_own_target: the RESPONDER's own number, required only when the change
-- adds or edits a scope='own' rule and the previous rule (for 'edit') has no
-- target on file for them to carry forward.

create or replace function public.respond_challenge_change(
  p_request_id uuid,
  p_approve boolean,
  p_own_target jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.challenge_change_requests%rowtype;
  v_challenge public.challenges%rowtype;
  v_rule jsonb;
  v_scope text;
  v_shape text;
  v_effective_from date;
  v_new_rule_id uuid;
  v_carried_count int;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_req from public.challenge_change_requests where id = p_request_id;
  if not found then
    raise exception 'Change request not found.' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This change request was already resolved.' using errcode = 'P0001';
  end if;
  if v_req.proposed_by = v_uid then
    raise exception 'You cannot respond to your own proposal.' using errcode = 'P0001';
  end if;
  if not public.is_challenge_participant(v_req.challenge_id) then
    raise exception 'Not a participant.' using errcode = '42501';
  end if;

  select * into v_challenge from public.challenges where id = v_req.challenge_id;

  if not p_approve then
    update public.challenge_change_requests
      set status = 'rejected', responded_by = v_uid, responded_at = now()
      where id = p_request_id;

    insert into public.notifications (user_id, kind, payload)
    values (
      v_req.proposed_by,
      'change_rejected',
      jsonb_build_object('requestId', p_request_id, 'challengeId', v_req.challenge_id, 'challengeName', v_challenge.name)
    );

    return jsonb_build_object('status', 'rejected');
  end if;

  v_effective_from := current_date + 1;

  if v_req.kind in ('edit', 'remove') then
    update public.challenge_rules
      set effective_to = current_date
      where id = v_req.rule_id and effective_to is null;
  end if;

  if v_req.kind in ('add', 'edit') then
    v_rule := v_req.payload -> 'rule';
    v_scope := v_rule ->> 'scope';
    v_shape := v_rule ->> 'shape';

    insert into public.challenge_rules (
      challenge_id, metric_key, shape, scope, target, min, max, weight, period, schedule,
      requires_proof, effective_from, created_by
    ) values (
      v_req.challenge_id,
      v_rule ->> 'metricKey',
      v_shape,
      v_scope,
      case when v_scope = 'shared' and v_shape in ('at_least', 'at_most')
        then (v_rule ->> 'target')::numeric else null end,
      case when v_scope = 'shared' and v_shape = 'range'
        then (v_rule ->> 'min')::numeric else null end,
      case when v_scope = 'shared' and v_shape = 'range'
        then (v_rule ->> 'max')::numeric else null end,
      coalesce((v_rule ->> 'weight')::smallint, 1),
      coalesce(v_rule ->> 'period', 'daily'),
      v_rule -> 'schedule',
      coalesce((v_rule ->> 'requiresProof')::boolean, false),
      v_effective_from,
      v_req.proposed_by
    )
    returning id into v_new_rule_id;

    if v_scope = 'own' then
      insert into public.challenge_rule_targets (rule_id, user_id, target, min, max)
      values (
        v_new_rule_id,
        v_req.proposed_by,
        nullif(v_req.payload -> 'ownTarget' ->> 'target', '')::numeric,
        nullif(v_req.payload -> 'ownTarget' ->> 'min', '')::numeric,
        nullif(v_req.payload -> 'ownTarget' ->> 'max', '')::numeric
      );

      v_carried_count := 0;
      if p_own_target is not null then
        insert into public.challenge_rule_targets (rule_id, user_id, target, min, max)
        values (
          v_new_rule_id,
          v_uid,
          nullif(p_own_target ->> 'target', '')::numeric,
          nullif(p_own_target ->> 'min', '')::numeric,
          nullif(p_own_target ->> 'max', '')::numeric
        );
      elsif v_req.kind = 'edit' then
        insert into public.challenge_rule_targets (rule_id, user_id, target, min, max)
        select v_new_rule_id, t.user_id, t.target, t.min, t.max
        from public.challenge_rule_targets t
        where t.rule_id = v_req.rule_id and t.user_id = v_uid;
        get diagnostics v_carried_count = row_count;
      end if;

      if p_own_target is null and (v_req.kind = 'add' or v_carried_count = 0) then
        raise exception 'This rule needs your own number.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  update public.challenge_change_requests
    set status = 'approved', responded_by = v_uid, responded_at = now(), effective_from = v_effective_from
    where id = p_request_id;

  insert into public.notifications (user_id, kind, payload)
  values (
    v_req.proposed_by,
    'change_approved',
    jsonb_build_object(
      'requestId', p_request_id,
      'challengeId', v_req.challenge_id,
      'challengeName', v_challenge.name,
      'effectiveFrom', v_effective_from
    )
  );

  return jsonb_build_object('status', 'approved', 'effectiveFrom', v_effective_from, 'newRuleId', v_new_rule_id);
end;
$$;

grant execute on function public.respond_challenge_change(uuid, boolean, jsonb) to authenticated;
