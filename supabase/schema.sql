-- Territorio 360 · Esquema inicial para Supabase / PostgreSQL
-- Ejecutar en un proyecto nuevo de Supabase después de revisar el esquema.
-- No contiene datos reales ni credenciales.

create extension if not exists pgcrypto;

create type public.member_role as enum ('admin', 'coordinator', 'collaborator');
create type public.record_status as enum ('pending', 'in_progress', 'completed');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Perfil mínimo. La autenticación (contraseña/MFA) la gestiona Supabase Auth.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'collaborator',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.localities (
  id uuid primary key default gen_random_uuid(),
  province text not null default 'Chaco',
  department text not null,
  name text not null,
  zone text,
  created_at timestamptz not null default now(),
  unique (province, department, name)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  locality_id uuid references public.localities(id) on delete set null,
  name text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  locality_id uuid references public.localities(id) on delete set null,
  title text not null,
  activity_type text not null default 'other',
  description text,
  starts_at timestamptz,
  status public.record_status not null default 'pending',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  title text not null,
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  status public.record_status not null default 'pending',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  created_at timestamptz not null default now()
);

create index activities_org_date_idx on public.activities(organization_id, starts_at);
create index tasks_org_status_idx on public.tasks(organization_id, status);
create index tasks_assigned_to_idx on public.tasks(assigned_to);
create index teams_org_idx on public.teams(organization_id);

-- Funciones auxiliares para las políticas RLS.
create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org and m.user_id = auth.uid()
  );
$$;

create or replace function public.org_role(target_org uuid)
returns public.member_role language sql stable security definer
set search_path = public
as $$
  select m.role from public.organization_members m
  where m.organization_id = target_org and m.user_id = auth.uid()
  limit 1;
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.localities enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.audit_logs enable row level security;

-- Perfiles: cada usuario consulta y modifica únicamente su propio perfil.
create policy "profile_select_self" on public.profiles
for select to authenticated using (id = auth.uid());
create policy "profile_select_org_peers" on public.profiles
for select to authenticated using (
  exists (
    select 1
    from public.organization_members mine
    join public.organization_members peer
      on peer.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and peer.user_id = profiles.id
  )
);
create policy "profile_update_self" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Organizaciones y miembros: solo integrantes pueden consultar.
create policy "org_select_members" on public.organizations
for select to authenticated using (public.is_org_member(id));
create policy "members_select_org" on public.organization_members
for select to authenticated using (public.is_org_member(organization_id));

-- Los administradores gestionan miembros. La creación inicial de la organización
-- y del primer administrador debe hacerse desde un proceso administrativo confiable.
create policy "members_admin_manage" on public.organization_members
for all to authenticated
using (public.org_role(organization_id) = 'admin')
with check (public.org_role(organization_id) = 'admin');

-- Localidades: catálogo de referencia de lectura para usuarios autenticados.
create policy "localities_read_authenticated" on public.localities
for select to authenticated using (true);
create policy "localities_admin_manage" on public.localities
for all to authenticated
using (exists (
  select 1 from public.organization_members m
  where m.user_id = auth.uid() and m.role = 'admin'
))
with check (exists (
  select 1 from public.organization_members m
  where m.user_id = auth.uid() and m.role = 'admin'
));

-- Equipos: los miembros de la organización consultan; admin/coordinador gestionan.
create policy "teams_select_members" on public.teams
for select to authenticated using (public.is_org_member(organization_id));
create policy "teams_coordinator_write" on public.teams
for all to authenticated
using (public.org_role(organization_id) in ('admin','coordinator'))
with check (public.org_role(organization_id) in ('admin','coordinator'));

create policy "team_members_select" on public.team_members
for select to authenticated using (exists (
  select 1 from public.teams t
  where t.id = team_id and public.is_org_member(t.organization_id)
));
create policy "team_members_manage" on public.team_members
for all to authenticated
using (exists (
  select 1 from public.teams t
  where t.id = team_id and public.org_role(t.organization_id) in ('admin','coordinator')
))
with check (exists (
  select 1 from public.teams t
  where t.id = team_id and public.org_role(t.organization_id) in ('admin','coordinator')
));

-- Actividades: todos los miembros pueden leer; admin/coordinador escriben.
-- Colaboradores pueden crear actividades propias, pero no modificar ni borrar las ajenas.
create policy "activities_select_members" on public.activities
for select to authenticated using (public.is_org_member(organization_id));
create policy "activities_insert_members" on public.activities
for insert to authenticated
with check (
  public.is_org_member(organization_id)
  and created_by = auth.uid()
);
create policy "activities_update_managers_or_creator" on public.activities
for update to authenticated
using (
  public.is_org_member(organization_id)
  and (
    public.org_role(organization_id) in ('admin','coordinator')
    or created_by = auth.uid()
  )
)
with check (
  public.is_org_member(organization_id)
  and (
    public.org_role(organization_id) in ('admin','coordinator')
    or created_by = auth.uid()
  )
);
create policy "activities_delete_managers" on public.activities
for delete to authenticated
using (public.org_role(organization_id) in ('admin','coordinator'));

-- Tareas: todos los miembros pueden leer; creación para miembros;
-- colaborador puede actualizar una tarea asignada a sí mismo.
create policy "tasks_select_members" on public.tasks
for select to authenticated using (public.is_org_member(organization_id));
create policy "tasks_insert_members" on public.tasks
for insert to authenticated
with check (public.is_org_member(organization_id) and created_by = auth.uid());
create policy "tasks_update_managers_or_assignee" on public.tasks
for update to authenticated
using (
  public.is_org_member(organization_id)
  and (
    public.org_role(organization_id) in ('admin','coordinator')
    or assigned_to = auth.uid()
  )
)
with check (
  public.is_org_member(organization_id)
  and (
    public.org_role(organization_id) in ('admin','coordinator')
    or assigned_to = auth.uid()
  )
);
create policy "tasks_delete_managers" on public.tasks
for delete to authenticated
using (public.org_role(organization_id) in ('admin','coordinator'));

create policy "audit_select_admins" on public.audit_logs
for select to authenticated
using (public.org_role(organization_id) = 'admin');

-- IMPORTANTE:
-- 1) No exponer jamás la clave service_role en el navegador.
-- 2) Completar el flujo seguro de alta de organización/primer administrador.
-- 3) Agregar triggers para updated_at y audit_logs antes de producción.
-- 4) Probar todas las políticas con usuarios de cada rol antes de cargar datos reales.
-- 5) Activar MFA para administradores y configurar backups/PITR según el plan elegido.
