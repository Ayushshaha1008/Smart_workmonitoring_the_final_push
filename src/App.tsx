/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Auth } from './components/Auth';
import { AdminDashboard } from './components/AdminDashboard';
import { EmployeeDashboard } from './components/EmployeeDashboard';
import { UserProfile } from './types';
import { supabase } from './supabase';

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  public state: { hasError: boolean, error: any };
  public props: { children: React.ReactNode };

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.props = props;
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 text-center">
          <div className="bg-slate-900 border border-red-900/30 p-10 rounded-3xl max-w-md shadow-2xl">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-slate-400 mb-6 text-sm">
              {this.state.error?.message || "An unexpected error occurred. Please try refreshing the page."}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-white text-slate-950 font-bold py-3 px-8 rounded-xl hover:bg-slate-100 transition-all"
            >
              Refresh App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [configMissing, setConfigMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      setConfigMissing(true);
      setIsLoading(false);
      return;
    }

    // Check for existing session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        let { data: profile, error } = await supabase
          .from('users')
          .select('*')
          .eq('uid', session.user.id)
          .maybeSingle();
        
        // Fallback for user schema where id is the primary key
        if (!profile || error) {
          const { data: profile2 } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
          profile = profile2;
        }
        
        if (profile) {
          setUser(profile as UserProfile);
        }
      }
      setIsLoading(false);
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        let { data: profile, error } = await supabase
          .from('users')
          .select('*')
          .eq('uid', session.user.id)
          .maybeSingle();

        // Fallback for alternate schema
        if (!profile || error) {
          const { data: profile2 } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
          profile = profile2;
        }
        
        if (profile) {
          setUser(prev => {
            // Only update if data is truly different to avoid unnecessary dashboard re-renders
            if (prev && JSON.stringify(prev) === JSON.stringify(profile)) {
              return prev;
            }
            return profile as UserProfile;
          });
        }
      } else if (event === 'SIGNED_OUT') {
        // Only wipe user state if they specifically signed out
        setUser(null);
      }
      // Note: We don't wipe on INITIAL_SESSION if null, 
      // because we might have a manual user set from Auth.tsx
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (user) {
      try {
        await supabase.from('users').update({ 
          status: 'offline',
          cameraSnapshotUrl: null,
          screenSnapshotUrl: null,
          isMonitoringLive: false
        }).eq('uid', user.uid);
      } catch (err) {
        console.error('Error setting status to offline on logout:', err);
      }
    }
    
    // Stop all active media tracks locally
    try {
      document.querySelectorAll('video, audio').forEach((el: any) => {
        if (el.srcObject) {
          (el.srcObject as MediaStream).getTracks().forEach((t: any) => { t.stop(); t.enabled = false; });
          el.srcObject = null;
        }
      });
    } catch (e) { /* ignore */ }

    // Use 'local' scope sign out - only if we have an Auth session
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // scope: 'local' ensures only THIS tab/browser is logged out, not other users
      await supabase.auth.signOut({ scope: 'local' });
    }
    
    setUser(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (configMissing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 text-center">
        <div className="bg-slate-900 border border-blue-900/30 p-10 rounded-3xl max-w-md shadow-2xl">
          <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Configuration Required</h2>
          <p className="text-slate-400 mb-6 text-sm">
            Please set your Supabase URL and Anon Key in the Secrets panel to get started.
          </p>
          <div className="text-left bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-slate-500 space-y-2">
            <p>VITE_SUPABASE_URL</p>
            <p>VITE_SUPABASE_ANON_KEY</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {!user ? (
        <Auth onAuth={setUser} />
      ) : ['admin', 'ceo', 'founder'].includes(user.role) ? (
        <AdminDashboard user={user} onLogout={handleLogout} />
      ) : (
        <EmployeeDashboard user={user} onLogout={handleLogout} />
      )}
    </ErrorBoundary>
  );
}
