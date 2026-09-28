'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { authErrorMessage } from '@/lib/authMessages';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Required rules gate the submit button. The symbol rule is optional and only
// raises the strength meter, so users see what makes a password stronger
// without being blocked by it.
const PASSWORD_RULES: { id: string; label: string; test: (pw: string) => boolean; required: boolean }[] = [
  { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8, required: true },
  { id: 'upper', label: 'One uppercase letter (A–Z)', test: (pw) => /[A-Z]/.test(pw), required: true },
  { id: 'lower', label: 'One lowercase letter (a–z)', test: (pw) => /[a-z]/.test(pw), required: true },
  { id: 'number', label: 'One number (0–9)', test: (pw) => /[0-9]/.test(pw), required: true },
  { id: 'symbol', label: 'One symbol, e.g. ! @ # $ % (recommended)', test: (pw) => /[^A-Za-z0-9]/.test(pw), required: false },
];

const STRENGTH_LEVELS = [
  { label: 'Too weak', bar: 'bg-red-500', text: 'text-red-600' },
  { label: 'Weak', bar: 'bg-orange-500', text: 'text-orange-600' },
  { label: 'Fair', bar: 'bg-yellow-500', text: 'text-yellow-700' },
  { label: 'Good', bar: 'bg-lime-500', text: 'text-lime-700' },
  { label: 'Strong', bar: 'bg-green-600', text: 'text-green-700' },
];

function getStrength(pw: string): number {
  if (!pw) return 0;
  const passed = PASSWORD_RULES.filter((r) => r.test(pw)).length;
  let score = Math.max(0, passed - 1); // 0..4
  if (pw.length >= 12 && score < 4) score += 1;
  if (pw.length < 8) score = Math.min(score, 1);
  return Math.min(score, 4);
}

/**
 * Feature 016 (reliability pass) — password recovery.
 *
 * Modes:
 *  - `checking`: the page was opened from a recovery LINK; waiting for the
 *    Supabase client, which exchanges `?code=` (PKCE) / `#access_token` itself on
 *    load, or for our own `token_hash` verification.
 *  - `link`: a valid recovery session exists → just choose a new password.
 *  - `code`: no link — enter email + recovery code from the email (existing flow).
 *  - `invalid`: expired / already used / invalid link, or a link opened in a
 *    different browser from the one that requested it (PKCE).
 *  - `done`: password updated; the recovery session is signed out and the user
 *    signs in normally with the new password.
 */
type Mode = 'checking' | 'link' | 'code' | 'invalid' | 'done';

/** One-time flag set by AuthContext when it redirects a PASSWORD_RECOVERY session here. */
const RECOVERY_FLAG = 'bendie.portal.recoveryPending'; // must match AuthContext

function readRecoveryParams() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const get = (k: string) => query.get(k) ?? hash.get(k);
  return {
    email: query.get('email'),
    code: query.get('code'),
    tokenHash: get('token_hash'),
    type: get('type'),
    hasAccessToken: hash.has('access_token'),
    fromRecoveryEvent: query.get('recovery') === '1',
    errorCode: get('error_code'),
    error: get('error') ?? get('error_description'),
  };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('checking');
  const [invalidReason, setInvalidReason] = useState<'expired' | 'invalid' | 'device'>('invalid');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const p = readRecoveryParams();
    if (p.email) setEmail(p.email);
    const isLinkVisit = Boolean(p.code || p.tokenHash || p.hasAccessToken || p.fromRecoveryEvent || p.error || p.errorCode);

    const settle = (next: Mode, reason?: 'expired' | 'invalid' | 'device') => {
      if (cancelled) return;
      // Strip one-time tokens from the address bar only AFTER the Supabase client
      // has finished reading them (it parses the URL during its own async init).
      if (isLinkVisit) window.history.replaceState(null, '', window.location.pathname);
      if (reason) setInvalidReason(reason);
      setMode(next);
    };

    if (!isLinkVisit) {
      settle('code');
      return;
    }
    if (p.error || p.errorCode) {
      settle('invalid', p.errorCode === 'otp_expired' ? 'expired' : 'invalid');
      return;
    }

    // Custom email templates may link with a token_hash instead of a PKCE code.
    if (p.tokenHash) {
      supabase.auth.verifyOtp({ token_hash: p.tokenHash, type: 'recovery' }).then(({ data, error }) => {
        if (error || !data.session) {
          console.error('[auth] recovery token_hash verification failed', error);
          settle('invalid', (error?.message ?? '').toLowerCase().includes('expired') ? 'expired' : 'invalid');
        } else settle('link');
      });
      return;
    }

    // A session alone is NOT proof the link worked: auth-js deliberately keeps an existing
    // session when a URL login fails ("a failed attempt shouldn't invalidate a valid
    // session"), so a signed-in user opening a dead link would otherwise look valid.
    if (p.fromRecoveryEvent) {
      // Hand-off from AuthContext, which saw PASSWORD_RECOVERY on another page and set a
      // one-time flag. Without the flag (e.g. the URL typed by hand) it isn't a recovery.
      let flagged = false;
      try {
        flagged = sessionStorage.getItem(RECOVERY_FLAG) === '1';
        sessionStorage.removeItem(RECOVERY_FLAG);
      } catch {
        flagged = false;
      }
      supabase.auth.getSession().then(({ data }) => settle(flagged && data.session ? 'link' : 'invalid'));
    } else {
      // `?code=` / `#access_token`: the client exchanges it during its own init.
      // initialize() returns THAT exchange's result — accept the link only if it succeeded.
      supabase.auth.initialize().then(async ({ error }) => {
        if (error) {
          console.error('[auth] recovery link exchange failed', error);
          const msg = (error.message ?? '').toLowerCase();
          settle('invalid', msg.includes('expired') ? 'expired' : p.code ? 'device' : 'invalid');
          return;
        }
        const { data } = await supabase.auth.getSession();
        settle(data.session ? 'link' : 'invalid', p.code ? 'device' : 'invalid');
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') settle('link');
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const ruleResults = PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(newPassword) }));
  const passwordValid = ruleResults.every((r) => !r.required || r.passed);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const emailValid = EMAIL_RE.test(email.trim());
  const codeValid = code.length >= 6 && code.length <= 10;
  const strength = getStrength(newPassword);
  const strengthLevel = STRENGTH_LEVELS[strength];

  const missing: string[] = [];
  if (mode === 'code' && !emailValid) missing.push('a valid email');
  if (mode === 'code' && !codeValid) missing.push('the recovery code from your email');
  if (!passwordValid) missing.push('a password that meets all the requirements');
  if (!passwordsMatch) missing.push('matching passwords');
  const canSubmit = missing.length === 0 && !loading;

  const finish = async () => {
    // Sign the recovery session out so the new password is what gets the user in.
    await supabase.auth.signOut();
    setMode('done');
    setTimeout(() => router.push('/auth/login?reset=success'), 1800);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setFormError(null);
    setLoading(true);
    try {
      if (mode === 'code') {
        const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'recovery' });
        if (verifyError) {
          setFormError(authErrorMessage(verifyError, 'We couldn’t verify that code. Check it, or request a new one.'));
          return;
        }
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        const message = authErrorMessage(updateError, 'We couldn’t update your password. Please try again.');
        if ((updateError.message ?? '').toLowerCase().includes('session')) {
          setInvalidReason('invalid');
          setMode('invalid');
          return;
        }
        setFormError(message);
        return;
      }
      await finish();
    } catch (err) {
      setFormError(authErrorMessage(err as { message?: string }, 'We couldn’t update your password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">{children}</div>
    </div>
  );

  if (mode === 'checking') {
    return shell(
      <div className="text-center py-6" role="status">
        <span className="material-symbols-outlined text-blue-600 text-[36px] animate-pulse" aria-hidden="true">lock_reset</span>
        <p className="text-gray-700 mt-2">Checking your reset link…</p>
      </div>
    );
  }

  if (mode === 'invalid') {
    return shell(
      <div className="text-center">
        <span className="material-symbols-outlined text-amber-600 text-[40px]" aria-hidden="true">link_off</span>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">This reset link is no longer valid</h1>
        <p className="text-gray-600 mt-2 text-sm">
          {invalidReason === 'expired'
            ? 'Reset links expire after a while for your security.'
            : invalidReason === 'device'
              ? 'It may have already been used, or it was opened in a different browser from the one you requested it in. Open the newest link on the same device and browser.'
              : 'It may have already been used, or it was copied incompletely.'}
        </p>
        <Link href="/auth/forgot-password" className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition block">
          Request a new link
        </Link>
        <button type="button" onClick={() => setMode('code')} className="mt-3 w-full text-blue-600 hover:text-blue-700 font-semibold py-2">
          I have a recovery code instead
        </button>
        <Link href="/auth/login" className="block mt-2 text-sm text-gray-600 hover:text-gray-800">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (mode === 'done') {
    return shell(
      <div className="text-center py-4" role="status">
        <span className="material-symbols-outlined text-green-600 text-[40px]" aria-hidden="true">check_circle</span>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Password updated</h1>
        <p className="text-gray-600 mt-2 text-sm">Taking you to sign in — use your new password.</p>
        <Link href="/auth/login?reset=success" className="inline-block mt-4 text-blue-600 hover:text-blue-700 font-semibold">
          Go to sign in now
        </Link>
      </div>
    );
  }

  return shell(
    <>
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Choose a new password</h1>
        <p className="text-gray-600 mt-2">
          {mode === 'link' ? 'Your reset link is valid. Enter your new password below.' : 'Enter the recovery code from your email and your new password.'}
        </p>
      </div>

      <form onSubmit={handleResetPassword} className="space-y-4" noValidate>
        {mode === 'code' && (
          <>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">The email address the reset email was sent to</p>
            </div>

            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                Recovery code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Code from your email"
                maxLength={10}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition font-mono text-center text-lg tracking-widest"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">Your email has a link instead? Just open the link — no code needed.</p>
            </div>
          </>
        )}

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            New password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Create a new password"
              autoComplete="new-password"
              aria-describedby="password-requirements"
              className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
            >
              <span className="material-symbols-outlined text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>

          {newPassword.length > 0 && (
            <div className="mt-2" aria-live="polite">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < strength ? strengthLevel.bar : 'bg-gray-200'}`} />
                ))}
              </div>
              <p className={`text-xs font-medium mt-1 ${strengthLevel.text}`}>Strength: {strengthLevel.label}</p>
            </div>
          )}

          <ul id="password-requirements" className="mt-2 space-y-1">
            {ruleResults.map((rule) => (
              <li
                key={rule.id}
                className={`flex items-center gap-1.5 text-xs ${rule.passed ? 'text-green-700' : rule.required ? 'text-gray-600' : 'text-gray-400'}`}
              >
                <span className="material-symbols-outlined text-[16px]">{rule.passed ? 'check_circle' : 'radio_button_unchecked'}</span>
                {rule.label}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-1">Tip: 12+ characters makes your password much stronger.</p>
        </div>

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-2">
            Confirm new password
          </label>
          <input
            id="confirm"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            autoComplete="new-password"
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${
              confirmPassword.length > 0 && !passwordsMatch ? 'border-red-400' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {confirmPassword.length > 0 && (
            <p className={`flex items-center gap-1.5 text-xs mt-1 ${passwordsMatch ? 'text-green-700' : 'text-red-600'}`}>
              <span className="material-symbols-outlined text-[16px]">{passwordsMatch ? 'check_circle' : 'cancel'}</span>
              {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
            </p>
          )}
        </div>

        {formError && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          {loading ? 'Resetting…' : 'Reset password'}
        </button>
        {!canSubmit && !loading && <p className="text-xs text-gray-500 text-center">To continue, enter {missing.join(', ')}.</p>}
      </form>

      <div className="mt-6 pt-6 border-t border-gray-200 text-center space-y-2">
        <Link href="/auth/forgot-password" className="block text-blue-600 hover:text-blue-700 font-semibold">
          Request a new link
        </Link>
        <Link href="/auth/login" className="block text-sm text-gray-600 hover:text-gray-800">
          Back to sign in
        </Link>
      </div>
    </>
  );
}
