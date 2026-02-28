import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, AlertTriangle, CheckCircle, Droplets, Map as MapIcon, Trash2, Plus, Database, Copy, Check } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

interface Field {
  id: string;
  name: string;
  area_hectares: number;
  crop_type: string;
  last_analysis: {
    healthy_percent: number;
    alert: boolean;
    date: string;
  } | null;
}

const SQL_SCRIPT = `-- Enable PostGIS extension for geospatial data types
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
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

create policy "Users can view own fields" on public.fields for select using (auth.uid() = user_id);
create policy "Users can insert own fields" on public.fields for insert with check (auth.uid() = user_id);
create policy "Users can update own fields" on public.fields for update using (auth.uid() = user_id);
create policy "Users can delete own fields" on public.fields for delete using (auth.uid() = user_id);

create policy "Users can view analyses" on public.analyses for select using (
  exists (select 1 from public.fields where fields.id = analyses.field_id and fields.user_id = auth.uid())
);
create policy "Users can insert analyses" on public.analyses for insert with check (
  exists (select 1 from public.fields where fields.id = analyses.field_id and fields.user_id = auth.uid())
);

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
  for each row execute procedure public.handle_new_user();`;

export default function Dashboard({ 
  onFieldSelect,
  onAddField
}: { 
  onFieldSelect: (id: string) => void;
  onAddField: () => void;
}) {
  const { user, isLoading: authLoading } = useAuth();
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      fetchFields();
    }
  }, [authLoading, user]);

  const fetchFields = async () => {
    try {
      const res = await axios.get('/api/fields');
      
      // Check if response is HTML (server starting/error page)
      if (typeof res.data === 'string' && res.data.includes('<!doctype html>')) {
          console.log("Server is warming up, retrying in 3s...");
          setTimeout(fetchFields, 3000);
          return;
      }

      if (Array.isArray(res.data)) {
        setFields(res.data);
        setDbError(false);
      } else {
        console.error("API returned non-array data:", res.data);
        setFields([]);
      }
    } catch (err: any) {
      console.error(err);
      if (err.response?.status === 503 && err.response?.data?.code === 'tables_missing') {
          setDbError(true);
      } else {
          // Show other errors
          console.error("Dashboard Fetch Error:", err.response?.data || err.message);
      }
      setFields([]);
    } finally {
      setLoading(false);
    }
  };

  const copySQL = () => {
      navigator.clipboard.writeText(SQL_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Вы уверены, что хотите удалить это поле?")) return;
    
    try {
      await axios.delete(`/api/fields/${id}`);
      setFields(fields.filter(f => f.id !== id));
    } catch (err) {
      console.error("Failed to delete field:", err);
      alert("Не удалось удалить поле");
    }
  };

  const stats = {
    total: fields.length,
    healthy: fields.filter(f => f.last_analysis && !f.last_analysis.alert).length,
    attention: fields.filter(f => f.last_analysis && f.last_analysis.alert).length,
    critical: fields.filter(f => f.last_analysis && f.last_analysis.healthy_percent < 50).length
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* DB Setup Warning Modal */}
      {dbError && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-red-500/20">
                  <div className="flex items-center gap-4 mb-6 text-red-600">
                      <div className="p-3 bg-red-100 rounded-full">
                          <Database className="w-8 h-8" />
                      </div>
                      <div>
                          <h2 className="text-2xl font-bold">Требуется настройка базы данных</h2>
                          <p className="text-sm text-black/60">Таблицы Supabase не найдены</p>
                      </div>
                  </div>
                  
                  <div className="space-y-4">
                      <p className="text-black/80">
                          Для работы приложения необходимо создать структуру базы данных. 
                          Пожалуйста, выполните следующий SQL-скрипт в <a href="https://supabase.com/dashboard/project/fyoctiotfcdtjshdbqap/sql" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">SQL Editor</a> вашего проекта Supabase.
                      </p>
                      <p className="text-xs text-red-600 font-bold">
                          Если вы уже выполнили скрипт, но видите это окно, попробуйте перезагрузить страницу через 30 секунд (Supabase обновляет кэш).
                      </p>
                      
                      <div className="relative">
                          <pre className="bg-gray-900 text-green-400 p-4 rounded-xl text-xs font-mono h-64 overflow-y-auto border border-black/10">
                              {SQL_SCRIPT}
                          </pre>
                          <button 
                              onClick={copySQL}
                              className="absolute top-4 right-4 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-colors backdrop-blur-md"
                          >
                              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              {copied ? 'Скопировано' : 'Копировать SQL'}
                          </button>
                      </div>

                      <div className="flex justify-end gap-3 pt-4">
                          <button 
                              onClick={() => fetchFields()}
                              className="px-4 py-3 bg-white border border-black/10 text-black rounded-xl font-bold hover:bg-gray-50 transition-colors"
                          >
                              Проверить снова
                          </button>
                          <button 
                              onClick={() => window.location.reload()}
                              className="px-6 py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-colors"
                          >
                              Я выполнил скрипт, обновить
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Welcome Banner */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-green-700 to-green-600 p-8 text-white shadow-lg shadow-green-900/20"
      >
        <div className="relative z-10">
          <h2 className="text-3xl font-bold mb-2">Добро пожаловать, {user?.name || 'Фермер'}!</h2>
          <p className="opacity-90 max-w-xl text-lg">
            Сегодня {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}. 
            Спутники Sentinel-2 обновили данные по вашим полям.
          </p>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/10 skew-x-12 transform translate-x-12" />
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          label="Всего полей" 
          value={stats.total} 
          icon={MapIcon} 
          color="bg-white" 
          textColor="text-gray-900"
        />
        <StatCard 
          label="В норме" 
          value={stats.healthy} 
          icon={CheckCircle} 
          color="bg-green-500" 
          textColor="text-white"
        />
        <StatCard 
          label="Внимание" 
          value={stats.attention} 
          icon={AlertTriangle} 
          color="bg-yellow-500" 
          textColor="text-white"
        />
        <StatCard 
          label="Критично" 
          value={stats.critical} 
          icon={Droplets} 
          color="bg-red-500"  
          textColor="text-white"
        />
      </div>

      {/* Fields Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-black/5 overflow-hidden">
        <div className="p-6 border-b border-black/5 flex justify-between items-center">
          <h3 className="font-bold text-lg">Состояние полей</h3>
          <button 
            onClick={onAddField}
            className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" /> Добавить поле
          </button>
        </div>
        
        {loading ? (
          <div className="p-12 text-center text-gray-400">Загрузка данных...</div>
        ) : fields.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            У вас пока нет добавленных полей.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 font-mono text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Название</th>
                  <th className="px-6 py-4 font-medium">Культура</th>
                  <th className="px-6 py-4 font-medium">Площадь (га)</th>
                  <th className="px-6 py-4 font-medium">Здоровье</th>
                  <th className="px-6 py-4 font-medium">Статус</th>
                  <th className="px-6 py-4 font-medium text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fields.map((field) => (
                  <tr key={field.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => onFieldSelect(field.id)}>
                    <td className="px-6 py-4 font-bold text-gray-900">{field.name}</td>
                    <td className="px-6 py-4 text-gray-600">{field.crop_type}</td>
                    <td className="px-6 py-4 font-mono text-gray-600">{field.area_hectares}</td>
                    <td className="px-6 py-4">
                      {field.last_analysis ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${field.last_analysis.healthy_percent > 70 ? 'bg-green-500' : field.last_analysis.healthy_percent > 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${field.last_analysis.healthy_percent}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-gray-600">{Math.round(field.last_analysis.healthy_percent)}%</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Нет данных</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {field.last_analysis?.alert ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                          <AlertTriangle className="w-3 h-3" /> Тревога
                        </span>
                      ) : field.last_analysis ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                          <CheckCircle className="w-3 h-3" /> Норма
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => onFieldSelect(field.id)}
                        className="text-blue-600 hover:text-blue-800 font-bold text-xs uppercase tracking-wide flex items-center gap-1"
                      >
                        Карта <ArrowUpRight className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => handleDelete(field.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="Удалить поле"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, textColor }: any) {
  return (
    <div className={`${color} ${textColor} p-6 rounded-3xl shadow-sm border border-black/5 flex flex-col justify-between h-32`}>
      <div className="flex justify-between items-start">
        <span className="font-medium opacity-80 text-sm">{label}</span>
        <Icon className="w-5 h-5 opacity-80" />
      </div>
      <span className="text-4xl font-mono font-bold tracking-tight">{value}</span>
    </div>
  );
}
