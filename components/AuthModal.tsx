'use client';
import { useState } from 'react';

// Email+password login / signup dialog. Receives the auth actions from useAuth so
// the whole app shares one session.
export function AuthModal({ onClose, signIn, signUp }: {
    onClose: () => void;
    signIn: (email: string, password: string) => Promise<string | null>;
    signUp: (email: string, password: string) => Promise<string | null>;
}) {
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const submit = async () => {
        if (!email || !password) { setMsg('Email and password required.'); return; }
        setBusy(true); setMsg(null);
        const err = mode === 'login' ? await signIn(email, password) : await signUp(email, password);
        setBusy(false);
        if (err) { setMsg(err); return; }
        if (mode === 'signup') {
            setMsg('Account created. If email confirmation is on, check your inbox first, then log in.');
            setMode('login');
            return;
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="w-full max-w-sm border border-rule-9 bg-surface p-5"
                 onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-pos">
                    {mode === 'login' ? 'Log in' : 'Create account'}
                </h3>
                <p className="mt-1 text-[11px] text-ink-2">
                    Needed to save your portfolio for tracking. Holdings are private to your account.
                </p>
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email"
                    autoComplete="email"
                    className="mt-3 w-full border border-rule-9 bg-white/5 px-2 py-2 text-xs outline-none focus:border-pos/40" />
                <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    className="mt-2 w-full border border-rule-9 bg-white/5 px-2 py-2 text-xs outline-none focus:border-pos/40" />
                <button onClick={submit} disabled={busy}
                    className="mt-3 w-full border border-pos/40 bg-pos/10 py-2 text-xs font-extrabold text-pos hover:bg-pos/10 disabled:opacity-40">
                    {busy ? '…' : mode === 'login' ? 'Log in' : 'Sign up'}
                </button>
                {msg && <p className="mt-2 text-[11px] text-warn">{msg}</p>}
                <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg(null); }}
                    className="mt-3 text-[11px] font-bold text-ink-2 underline">
                    {mode === 'login' ? "No account? Sign up" : 'Have an account? Log in'}
                </button>
            </div>
        </div>
    );
}
