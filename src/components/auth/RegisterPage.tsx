import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Leaf, Mail, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
          },
        },
      });

      if (error) throw error;
      
      navigate('/');
    } catch (err: any) {
      console.error(err);
      if (err.message.includes('already registered')) {
        setError('Этот email уже зарегистрирован');
      } else if (err.message.includes('Password should be at least')) {
        setError('Пароль слишком слабый (минимум 6 символов)');
      } else {
        setError(err.message || 'Ошибка при регистрации. Попробуйте позже.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gold rounded-2xl flex items-center justify-center shadow-lg shadow-gold/20">
              <Leaf className="text-white w-7 h-7" />
            </div>
            <h1 className="font-bold text-2xl text-brown-text tracking-tight">AgroSat AI</h1>
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl border border-black/5 p-8"
        >
          <h2 className="text-2xl font-bold text-center mb-2">Создать аккаунт</h2>
          <p className="text-center text-black/40 mb-8 text-sm">Начните мониторинг ваших полей сегодня</p>

          {error && (
            <div className="mb-6 p-4 bg-terra/10 border border-terra/20 rounded-xl flex items-start gap-3 text-terra text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-black/50 uppercase mb-1 ml-1">Имя</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black/30" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-surface-muted rounded-xl border-transparent focus:bg-white focus:border-gold focus:ring-4 focus:ring-gold/10 transition-all outline-none"
                  placeholder="Иван Иванов"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-black/50 uppercase mb-1 ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black/30" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-surface-muted rounded-xl border-transparent focus:bg-white focus:border-gold focus:ring-4 focus:ring-gold/10 transition-all outline-none"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-black/50 uppercase mb-1 ml-1">Пароль</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black/30" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-surface-muted rounded-xl border-transparent focus:bg-white focus:border-gold focus:ring-4 focus:ring-gold/10 transition-all outline-none"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gold text-white rounded-xl font-bold shadow-lg shadow-gold/20 hover:bg-amber-warn transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Зарегистрироваться <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-black/5 text-center">
            <p className="text-sm text-black/40">
              Уже есть аккаунт?{' '}
              <Link to="/login" className="font-bold text-gold hover:text-amber-warn transition-colors">
                Войти
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
