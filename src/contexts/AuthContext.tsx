'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import type { Database } from '@/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

export interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isGlobalAdmin: boolean;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data ?? null);
  };

  // Corrective fix (Feature 016 continuation, performance investigation) —
  // the previous version called BOTH `getSession()` on mount AND subscribed
  // to `onAuthStateChange`, and `onAuthStateChange` itself already fires
  // once immediately on subscribe with the current session (an
  // `INITIAL_SESSION` event under the hood) — so every page load, including
  // login, was fetching the user's profile TWICE from Supabase, sequentially
  // racing each other, for no benefit. The listener alone is the documented,
  // sufficient pattern; removing the redundant explicit `getSession()` call
  // halves the auth-resolution round trips on every single page load without
  // changing behavior (the listener's first callback already carries
  // whatever `getSession()` would have returned).
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const isGlobalAdmin = profile?.global_role === 'admin';

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, isGlobalAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
