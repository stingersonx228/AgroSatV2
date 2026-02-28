import React, { useState, useEffect } from 'react';
import { User, Bell, Shield, Key, Save, Check, LogOut, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function SettingsView() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');

  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    org: ''
  });

  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    telegram: false,
    weekly_report: true
  });

  useEffect(() => {
    if (user) {
      setProfile({
        name: user.name || '',
        email: user.email || '',
        phone: '+7 777 123 45 67', // Mock for now as it's not in DB
        org: 'AgroHolding LLP' // Mock for now
      });
      if (user.settings) {
          setNotifications(prev => ({
              ...prev,
              email: user.settings.notifications
          }));
      }
    }
  }, [user]);

  const handleSave = async () => {
    setLoading(true);
    setMessage('');
    
    try {
        const response = await axios.put('/api/user/settings', {
            name: profile.name,
            email: profile.email,
            settings: {
                notifications: notifications.email
            }
        });

        updateUser(response.data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    } catch (error) {
        console.error("Failed to save settings:", error);
        setMessage('Ошибка при сохранении');
    } finally {
        setLoading(false);
    }
  };

  const handleLogout = () => {
      logout();
      navigate('/login');
  };

  const generateApiKey = () => {
    setApiKey('sk_live_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
  };

  const tabs = [
    { id: 'profile', label: 'Профиль', icon: User },
    { id: 'notifications', label: 'Уведомления', icon: Bell },
    { id: 'security', label: 'Безопасность', icon: Shield },
    { id: 'api', label: 'API и Интеграции', icon: Key },
  ];

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto h-full flex flex-col md:flex-row gap-8">
      {/* Sidebar */}
      <div className="w-full md:w-64 space-y-2">
        <h2 className="text-2xl font-bold mb-6 px-2">Настройки</h2>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
              activeTab === tab.id 
                ? "bg-gold text-white shadow-md shadow-gold/20" 
                : "text-black/60 hover:bg-surface-muted"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
        
        <div className="pt-4 mt-4 border-t border-black/5">
            <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
            >
                <LogOut className="w-4 h-4" />
                Выйти из аккаунта
            </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-black/5 p-8">
        
        {message && (
            <div className="mb-4 p-3 bg-red-100 text-red-600 rounded-lg text-sm">
                {message}
            </div>
        )}

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold border-b border-black/5 pb-4">Личные данные</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-black/50 uppercase mb-1">ФИО</label>
                <input 
                  type="text" 
                  value={profile.name}
                  onChange={e => setProfile({...profile, name: e.target.value})}
                  className="w-full rounded-xl border-black/10 bg-surface-muted focus:ring-gold focus:border-gold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-black/50 uppercase mb-1">Email</label>
                <input 
                  type="email" 
                  value={profile.email}
                  onChange={e => setProfile({...profile, email: e.target.value})}
                  className="w-full rounded-xl border-black/10 bg-surface-muted focus:ring-gold focus:border-gold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-black/50 uppercase mb-1">Телефон</label>
                <input 
                  type="text" 
                  value={profile.phone}
                  onChange={e => setProfile({...profile, phone: e.target.value})}
                  className="w-full rounded-xl border-black/10 bg-surface-muted focus:ring-gold focus:border-gold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-black/50 uppercase mb-1">Организация</label>
                <input 
                  type="text" 
                  value={profile.org}
                  onChange={e => setProfile({...profile, org: e.target.value})}
                  className="w-full rounded-xl border-black/10 bg-surface-muted focus:ring-gold focus:border-gold"
                />
              </div>
            </div>

            <div className="pt-4">
              <button 
                onClick={handleSave}
                disabled={loading}
                className="px-6 py-3 bg-gold text-white rounded-xl font-bold shadow-lg shadow-gold/20 hover:bg-amber-warn transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Сохранение...</> : saved ? <><Check className="w-4 h-4" /> Сохранено</> : <><Save className="w-4 h-4" /> Сохранить изменения</>}
              </button>
            </div>
          </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold border-b border-black/5 pb-4">Настройки уведомлений</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-black/5 rounded-xl">
                <div>
                  <div className="font-bold text-sm">Email оповещения</div>
                  <div className="text-xs text-black/50">Получать еженедельные отчеты и критические алерты</div>
                </div>
                <input 
                  type="checkbox" 
                  checked={notifications.email}
                  onChange={e => setNotifications({...notifications, email: e.target.checked})}
                  className="w-5 h-5 text-gold rounded focus:ring-gold border-gray-300"
                />
              </div>

              <div className="flex items-center justify-between p-4 border border-black/5 rounded-xl">
                <div>
                  <div className="font-bold text-sm">Push-уведомления</div>
                  <div className="text-xs text-black/50">Мгновенные уведомления в браузере</div>
                </div>
                <input 
                  type="checkbox" 
                  checked={notifications.push}
                  onChange={e => setNotifications({...notifications, push: e.target.checked})}
                  className="w-5 h-5 text-gold rounded focus:ring-gold border-gray-300"
                />
              </div>

              <div className="flex items-center justify-between p-4 border border-black/5 rounded-xl bg-surface-muted/50">
                <div>
                  <div className="font-bold text-sm">Telegram Бот</div>
                  <div className="text-xs text-black/50">Подключите бота для получения алертов в мессенджер</div>
                </div>
                <button className="px-4 py-2 bg-white border border-black/10 rounded-lg text-xs font-bold hover:bg-gray-50">
                  Подключить
                </button>
              </div>
            </div>
             <div className="pt-4">
              <button 
                onClick={handleSave}
                disabled={loading}
                className="px-6 py-3 bg-gold text-white rounded-xl font-bold shadow-lg shadow-gold/20 hover:bg-amber-warn transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Сохранение...</> : saved ? <><Check className="w-4 h-4" /> Сохранено</> : <><Save className="w-4 h-4" /> Сохранить изменения</>}
              </button>
            </div>
          </div>
        )}

        {/* API TAB */}
        {activeTab === 'api' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold border-b border-black/5 pb-4">API для разработчиков</h3>
            
            <div className="bg-surface-muted p-6 rounded-2xl border border-black/5">
              <h4 className="font-bold mb-2">Ваш API Key</h4>
              <p className="text-sm text-black/60 mb-4">Используйте этот ключ для доступа к REST API AgroSat.</p>
              
              {apiKey ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black text-green-400 p-3 rounded-lg font-mono text-sm overflow-x-auto">
                    {apiKey}
                  </code>
                  <button 
                    onClick={() => {navigator.clipboard.writeText(apiKey); alert('Скопировано!')}}
                    className="p-3 bg-white border border-black/10 rounded-lg hover:bg-gray-50"
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <button 
                  onClick={generateApiKey}
                  className="px-4 py-2 bg-black text-white rounded-lg text-sm font-bold hover:bg-gray-800"
                >
                  Сгенерировать ключ
                </button>
              )}
            </div>

            <div>
              <h4 className="font-bold mb-4">Доступные методы</h4>
              <div className="space-y-3">
                <div className="p-4 border border-black/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-bold">GET</span>
                    <code className="text-sm font-bold">/api/fields</code>
                  </div>
                  <p className="text-xs text-black/50">Получить список всех полей с текущими статусами.</p>
                </div>

                <div className="p-4 border border-black/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-bold">GET</span>
                    <code className="text-sm font-bold">/api/fields/:id/history</code>
                  </div>
                  <p className="text-xs text-black/50">Получить историю NDVI анализа для конкретного поля.</p>
                </div>

                <div className="p-4 border border-black/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">POST</span>
                    <code className="text-sm font-bold">/api/analyze</code>
                  </div>
                  <p className="text-xs text-black/50">Запустить новый анализ спутниковых снимков.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECURITY TAB (Placeholder) */}
        {activeTab === 'security' && (
           <div className="space-y-6">
            <h3 className="text-xl font-bold border-b border-black/5 pb-4">Безопасность</h3>
            <p className="text-black/60">Здесь можно сменить пароль и настроить двухфакторную аутентификацию.</p>
            <button className="px-4 py-2 border border-black/10 rounded-lg text-sm font-bold hover:bg-gray-50">
              Сменить пароль
            </button>
           </div>
        )}

      </div>
    </div>
  );
}
