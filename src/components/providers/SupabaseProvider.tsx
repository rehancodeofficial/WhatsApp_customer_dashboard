'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createBrowserSupabase } from '@/lib/supabase/client';

interface SupabaseContextType {
  supabase: SupabaseClient | null; // null in demo mode
  user: User | null;
  loading: boolean;
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createBrowserSupabase());
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  return <SupabaseContext.Provider value={{ supabase, user, loading }}>{children}</SupabaseContext.Provider>;
}

export function useSupabase() {
  const context = useContext(SupabaseContext);
  if (!context) throw new Error('useSupabase must be used within a SupabaseProvider');
  return context;
}
