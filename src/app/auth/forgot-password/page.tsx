'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { authErrorMessage } from '@/lib/authMessages';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Feature 016 (reliability pass). Supabase sends the recovery email; depending
 * on the project's email template it contains a link (handled by
 * /auth/reset-password — and by AuthContext if Supabase falls back to the Site
 * URL), a code, or both. Copy covers both, and never reveals whether an
 * account exists (Supabase itself answers the same way for unknown emails).
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'sending') return;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setFieldError('Enter the email address you use for Bendie, for example name@company.com.');
      return;
    }
    setFieldError(null);
    setFormError(null);
    setStatus('sending');
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) {
      setStatus('error');
      setFormError(authErrorMessage(error, 'We couldn’t send the reset email. Please try again.'));
      return;
    }
    setStatus('sent');
  };

  if (status === 'sent') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <span className="material-symbols-outlined text-blue-600 text-[40px]" aria-hidden="true">mark_email_read</span>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">Check your email</h1>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-900 space-y-2" role="status">
            <p>
              If an account exists for <span className="font-semibold">{email.trim()}</span>, we&apos;ve sent password reset instructions.
            </p>
            <p>Open the link in the email on this device. If your email contains a recovery code instead, enter it on the next page.</p>
            <p className="text-blue-800/80">Nothing arrived after a few minutes? Check your spam folder, or send it again.</p>
          </div>
          <Link
            href={`/auth/reset-password?email=${encodeURIComponent(email.trim())}`}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition mb-3 block text-center"
          >
            I have a recovery code
          </Link>
          <button onClick={() => setStatus('idle')} className="w-full text-blue-600 hover:text-blue-700 font-semibold py-2">
            Send again or use a different email
          </button>
          <p className="text-center mt-4">
            <Link href="/auth/login" className="text-sm text-gray-600 hover:text-gray-800">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Forgot your password?</h1>
          <p className="text-gray-600 mt-2">Enter the email address you use for Bendie and we&apos;ll send you a reset link.</p>
        </div>

        <form onSubmit={handleSendReset} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldError) setFieldError(null);
              }}
              placeholder="name@company.com"
              autoComplete="email"
              aria-invalid={!!fieldError}
              aria-describedby={fieldError ? 'email-error' : undefined}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${fieldError ? 'border-red-400' : 'border-gray-300'}`}
              disabled={status === 'sending'}
            />
            {fieldError && (
              <p id="email-error" className="text-xs text-red-600 mt-1">
                {fieldError}
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
            disabled={status === 'sending'}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            {status === 'sending' ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
          <Link href="/auth/login" className="text-blue-600 hover:text-blue-700 font-semibold">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
