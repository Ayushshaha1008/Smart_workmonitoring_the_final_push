import React, { useState } from 'react';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import { Shield, User, Key, Loader2 } from 'lucide-react';

export const Auth: React.FC<{ onAuth: (user: UserProfile | null) => void }> = ({ onAuth }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<'employee' | 'admin'>('employee');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showFirstRun, setShowFirstRun] = useState(false);

  const checkEmptyDb = async () => {
    try {
      const { count, error: countError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
      
      if (!countError && count === 0) {
        setShowFirstRun(true);
      }
    } catch (e) {
      console.warn('Could not check if DB is empty', e);
    }
  };

  React.useEffect(() => {
    checkEmptyDb();
  }, []);

  const handleFirstAdmin = async () => {
    if (!name.trim() || !code.trim()) {
      setError('Please enter a Name and Special Code to create the first Admin.');
      return;
    }
    setLoading(true);
    try {
      const uid = 'admin-' + Math.random().toString(36).substring(2, 9);
      const { error: insertError } = await supabase.from('users').insert({
        uid,
        displayName: name.trim(),
        email: 'admin@local.test',
        role: 'admin',
        specialCode: code.trim(),
        status: 'active',
        hourlyRate: 1000
      });

      if (insertError) throw insertError;
      
      setRole('admin');
      setShowFirstRun(false);
      setError('Admin account created! Now sign in with your credentials.');
    } catch (err: any) {
      setError(`Failed to create admin: ${err.message}. 
      Make sure you have run the SQL in DATABASE_SETUP.md first!`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const trimmedName = name.trim();
      const trimmedCode = code.trim();

      // Search for user with matching name, special code, and role in Supabase
      const { data, error: supabaseError } = await supabase
        .from('users')
        .select('*')
        .eq('displayName', trimmedName)
        .eq('specialCode', trimmedCode)
        .eq('role', role)
        .single();
      
      if (supabaseError) {
        if (supabaseError.code === 'PGRST116') {
          setError(`User "${trimmedName}" not found. 
          1. If you just reset the database, you must add yourself as an Admin again.
          2. Click "Admin Login" and use your Admin credentials.
          3. If you are an Employee, ask your Admin to add you in the Dashboard.`);
        } else {
          setError(`Database Error: ${supabaseError.message}. Check your Supabase URL/Key.`);
          throw supabaseError;
        }
      } else if (data) {
        onAuth(data as UserProfile);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'An error occurred during login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-10 shadow-2xl">
        <div className="w-20 h-20 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Shield className="w-10 h-10 text-blue-500" />
        </div>
        <h1 className="text-3xl font-bold text-white text-center mb-2">WorkWatch AI</h1>
        <p className="text-slate-400 text-center mb-8 text-sm italic">Secure Remote Workforce Monitoring</p>
        
        {/* Role Toggle Buttons */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 mb-8">
          <button 
            onClick={() => setRole('employee')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${role === 'employee' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Employee Login
          </button>
          <button 
            onClick={() => setRole('admin')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${role === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Admin Login
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Full Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="text" 
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="e.g. Darshan Patil"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Special Code</label>
            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="password" 
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="Enter your unique code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Sign In'}
          </button>
          
          {showFirstRun && (
            <button
              type="button"
              onClick={handleFirstAdmin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 px-6 rounded-xl transition-all active:scale-95 disabled:opacity-50 mt-4 border border-emerald-400/20"
            >
               {loading ? <Loader2 className="animate-spin" /> : 'Register as First Admin'}
            </button>
          )}
        </form>
        
        <div className="mt-8 pt-8 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500">
            Contact your administrator if you've lost your special code.
          </p>
        </div>
      </div>
    </div>
  );
};
