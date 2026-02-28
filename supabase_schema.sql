-- Enable PostGIS extension for geospatial data types
create extension if not exists postgis;

-- Create Profiles table (extends Supabase Auth)
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  name text,
  role text default 'farmer',
  settings jsonb default '{"units": "metric", "notifications": true, "theme": "light"}',
  created_at timestamptz default now()
);

-- Create Fields table
create table public.fields (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  location geometry(Point, 4326),
  polygon geometry(Polygon, 4326),
  area_hectares float,
  crop_type text,
  last_analysis jsonb,
  created_at timestamptz default now()
);

-- Create Analyses table
create table public.analyses (
  id uuid default gen_random_uuid() primary key,
  field_id uuid references public.fields on delete cascade not null,
  ndvi_average float,
  healthy_percent float,
  moderate_percent float,
  stressed_percent float,
  weather_data jsonb,
  ai_insight jsonb,
  created_at timestamptz default now()
);

-- Create Activity Log table
create table public.activity_log (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  type text,
  details text,
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.fields enable row level security;
alter table public.analyses enable row level security;
alter table public.activity_log enable row level security;

-- Create Policies
-- Profiles: Users can view and update their own profile
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Fields: Users can CRUD their own fields
create policy "Users can view own fields" on public.fields for select using (auth.uid() = user_id);
create policy "Users can insert own fields" on public.fields for insert with check (auth.uid() = user_id);
create policy "Users can update own fields" on public.fields for update using (auth.uid() = user_id);
create policy "Users can delete own fields" on public.fields for delete using (auth.uid() = user_id);

-- Analyses: Users can view analyses for their fields
create policy "Users can view analyses" on public.analyses for select using (
  exists (select 1 from public.fields where fields.id = analyses.field_id and fields.user_id = auth.uid())
);
create policy "Users can insert analyses" on public.analyses for insert with check (
  exists (select 1 from public.fields where fields.id = analyses.field_id and fields.user_id = auth.uid())
);

-- Activity Log: Users can view their own logs
create policy "Users can view own logs" on public.activity_log for select using (auth.uid() = user_id);
create policy "Users can insert own logs" on public.activity_log for insert with check (auth.uid() = user_id);

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
