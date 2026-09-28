'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
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
  // Feature 016 (performance pass): the user id the profile was last loaded for.
  const profileUserIdRef = useRef<string | null>(null);

  /** Returns whether the profile actually loaded, so a failed load can be retried. */
  const fetchProfile = async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) console.error('AuthContext: profile load failed', error);
    setProfile(data ?? null);
    return !error;
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
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Feature 016 (reliability pass): if a password-recovery link lands anywhere
      // other than the reset page (e.g. Supabase fell back to the Site URL because
      // the redirect URL isn't allow-listed), the client has already created the
      // recovery session here — send the user to set their new password instead
      // of silently signing them in. Full-page replace: no redirect loop, since the
      // reset page itself is excluded.
      if (event === 'PASSWORD_RECOVERY' && typeof window !== 'undefined' && window.location.pathname !== '/auth/reset-password') {
        try {
          sessionStorage.setItem('bendie.portal.recoveryPending', '1'); // one-time proof for the reset page
        } catch {
          // Storage unavailable — the reset page will then ask for a new link / the code.
        }
        window.location.replace('/auth/reset-password?recovery=1');
        return;
      }
      setSession(session);
      // Feature 016 (performance pass): TOKEN_REFRESHED fires hourly, on tab refocus
      // near expiry, and is broadcast to every open Portal tab. Previously each one
      // replaced `user` with a new object and re-fetched the profile — and because
      // OrganizationContext/EventContext depend on `user`, that cascaded into
      // re-fetching organisations, memberships and the events list with nothing
      // having changed. Now the same user keeps the same object and profile; a
      // DIFFERENT user (or USER_UPDATED, e.g. email change) still refreshes
      // immediately, so identity-scoped state can never carry across users.
      const nextUser = session?.user ?? null;
      const sameUser = !!nextUser && nextUser.id === profileUserIdRef.current;
      const refresh = !sameUser || event === 'USER_UPDATED';
      setUser((prev) => (prev && nextUser && prev.id === nextUser.id && !refresh ? prev : nextUser));
      if (nextUser) {
        if (refresh) {
          // Only remember the user once their profile has genuinely loaded: a failed load
          // (e.g. a transient network error) is retried on the next auth event instead of
          // being skipped for the rest of the session.
          const loaded = await fetchProfile(nextUser.id);
          profileUserIdRef.current = loaded ? nextUser.id : null;
        }
      } else {
        profileUserIdRef.current = null;
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const logout = async () => {
    profileUserIdRef.current = null;
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
