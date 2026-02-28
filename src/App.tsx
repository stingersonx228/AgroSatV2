import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  Activity, 
  History, 
  Settings, 
  Plus, 
  AlertTriangle,
  Leaf,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

// Components
import Dashboard from '@/components/Dashboard';
import MapView from '@/components/MapView';
import FieldAnalysis from '@/components/FieldAnalysis';
import HistoryView from '@/components/HistoryView';
import SettingsView from '@/components/SettingsView';
import LoginPage from '@/components/auth/LoginPage';
import RegisterPage from '@/components/auth/RegisterPage';

const RequireAuth = ({ children }: { children: React.ReactElement }) => {
  const { token, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen bg-cream">Loading...</div>;
  }

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [isAddingField, setIsAddingField] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { id: '/', label: 'Дашборд', icon: LayoutDashboard },
    { id: '/map', label: 'Карта', icon: MapIcon },
    { id: '/analysis', label: 'Аналитика', icon: Activity },
    { id: '/history', label: 'История', icon: History },
    { id: '/settings', label: 'Настройки', icon: Settings },
  ];

  const handleFieldSelect = (fieldId: string) => {
    setSelectedFieldId(fieldId);
    navigate('/analysis');
  };

  const handleAddField = () => {
    setIsAddingField(true);
    navigate('/map');
  };

  const handleLogout = () => {
      logout();
      navigate('/login');
  };

  // If on login or register page, render without layout
  if (location.pathname === '/login' || location.pathname === '/register') {
      return (
          <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
          </Routes>
      );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-cream text-brown-text">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r border-black/5 shadow-sm z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-gold rounded-xl flex items-center justify-center shadow-md shadow-gold/20">
            <Leaf className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight leading-none">AgroSat AI</h1>
            <p className="text-xs text-black/40 font-mono mt-1">SENTINEL-2 LIVE</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                location.pathname === item.id 
                  ? "bg-gold text-white shadow-md shadow-gold/20" 
                  : "text-brown-text/60 hover:bg-surface-muted hover:text-brown-text"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-black/5">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-muted">
            <div className="w-8 h-8 rounded-full bg-green-leaf flex items-center justify-center text-white text-xs font-bold">
              {user?.name ? user.name.substring(0, 2).toUpperCase() : 'US'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-black/40 truncate">{user?.email || 'Pro Plan'}</p>
            </div>
            <LogOut onClick={handleLogout} className="w-4 h-4 text-black/40 cursor-pointer hover:text-terra" />
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-black/5 flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gold rounded-lg flex items-center justify-center">
            <Leaf className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-lg">AgroSat AI</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2">
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed top-16 left-0 right-0 bg-white border-b border-black/5 shadow-xl z-20 p-4"
          >
            <nav className="space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    navigate(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium",
                    location.pathname === item.id 
                      ? "bg-gold text-white" 
                      : "text-brown-text/60"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
              <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50"
                >
                  <LogOut className="w-5 h-5" />
                  Выйти
                </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-16 md:pt-0 relative">
        <div className="h-full w-full">
          <Routes>
            <Route path="/" element={
              <RequireAuth>
                <Dashboard onFieldSelect={handleFieldSelect} onAddField={handleAddField} />
              </RequireAuth>
            } />
            <Route path="/map" element={
              <RequireAuth>
                <MapView 
                  onFieldSelect={handleFieldSelect} 
                  isAddingField={isAddingField} 
                  setIsAddingField={setIsAddingField} 
                />
              </RequireAuth>
            } />
            <Route path="/analysis" element={
              <RequireAuth>
                <FieldAnalysis fieldId={selectedFieldId} />
              </RequireAuth>
            } />
            <Route path="/history" element={
              <RequireAuth>
                <HistoryView />
              </RequireAuth>
            } />
            <Route path="/settings" element={
              <RequireAuth>
                <SettingsView />
              </RequireAuth>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
