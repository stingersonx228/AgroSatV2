import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Clock, Plus, Play, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

export default function HistoryView() {
  const { user, isLoading: authLoading } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && user) {
      fetchHistory();
    }
  }, [authLoading, user]);

  const fetchHistory = async () => {
    try {
      const res = await axios.get('/api/activity');
      if (Array.isArray(res.data)) {
        setActivities(res.data);
      } else {
        console.error("API returned non-array data:", res.data);
        setActivities([]);
      }
    } catch (err) {
      console.error(err);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'create_field': return <Plus className="w-4 h-4 text-white" />;
      case 'analysis': return <Play className="w-4 h-4 text-white" />;
      case 'alert': return <AlertTriangle className="w-4 h-4 text-white" />;
      default: return <Clock className="w-4 h-4 text-white" />;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'create_field': return 'bg-gold';
      case 'analysis': return 'bg-green-leaf';
      case 'alert': return 'bg-terra';
      default: return 'bg-black/40';
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold">История активности</h2>
        <button 
          onClick={fetchHistory}
          className="text-sm font-bold text-gold hover:text-amber-warn"
        >
          Обновить
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-black/5 flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-black/40">
            Загрузка истории...
          </div>
        ) : activities.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-black/40">
            История пуста
          </div>
        ) : (
          <div className="overflow-y-auto p-6 space-y-6">
            {activities.map((activity, index) => (
              <div key={activity.id} className="relative pl-8 pb-6 last:pb-0">
                {/* Timeline Line */}
                {index !== activities.length - 1 && (
                  <div className="absolute left-[15px] top-8 bottom-0 w-px bg-black/10" />
                )}
                
                {/* Icon */}
                <div className={cn(
                  "absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm z-10",
                  getColor(activity.type)
                )}>
                  {getIcon(activity.type)}
                </div>

                {/* Content */}
                <div className="bg-surface-muted/50 p-4 rounded-2xl border border-black/5">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-bold text-black/40 uppercase tracking-wider">
                      {new Date(activity.date).toLocaleString('ru-RU')}
                    </span>
                  </div>
                  <p className="font-medium text-black/80">{activity.details}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
