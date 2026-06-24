'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Email+password auth via Supabase. The browser anon client persists the session
// in localStorage and refreshes tokens automatically; my_portfolio / mine-ledger
// reads & writes carry the user's JWT, so RLS scopes them to the owner.
export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!supabase) { setReady(true); return; }
        supabase.auth.getSession().then(({ data }: any) => {
            setUser(data.session?.user ?? null);
            setReady(true);
        });
        const { data: sub } = supabase.auth.onAuthStateChange((_e: any, session: any) => {
            setUser(session?.user ?? null);
        });
        return () => sub.subscription.unsubscribe();
    }, []);

    return {
        user,
        ready,
        async signIn(email: string, password: string): Promise<string | null> {
            if (!supabase) return 'Auth unavailable (Supabase not configured).';
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            return error?.message ?? null;
        },
        async signUp(email: string, password: string): Promise<string | null> {
            if (!supabase) return 'Auth unavailable (Supabase not configured).';
            const { error } = await supabase.auth.signUp({ email, password });
            return error?.message ?? null;
        },
        async signOut(): Promise<void> {
            if (supabase) await supabase.auth.signOut();
        },
    };
}
