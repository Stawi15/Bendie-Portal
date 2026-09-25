'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

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

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Prefill the email carried over from the forgot-password page.
  useEffect(() => {
    const prefill = new URLSearchParams(window.location.search).get('email');
    if (prefill) setEmail(prefill);
  }, []);

  const ruleResults = PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(newPassword) }));
  const passwordValid = ruleResults.every((r) => !r.required || r.passed);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const emailValid = EMAIL_RE.test(email.trim());
  const codeValid = code.length >= 6 && code.length <= 10;
  const strength = getStrength(newPassword);
  const strengthLevel = STRENGTH_LEVELS[strength];

  const missing: string[] = [];
  if (!emailValid) missing.push('a valid email');
  if (!codeValid) missing.push('the recovery code from your email');
  if (!passwordValid) missing.push('a password that meets all the requirements');
  if (!passwordsMatch) missing.push('matching passwords');
  const canSubmit = missing.length === 0 && !loading && !done;

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setFormError(null);
    setLoading(true);
    try {
      // Step 1: Verify the OTP (recovery code)
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: 'recovery',
      });

      if (verifyError) {
        console.error('OTP verification error:', verifyError);
        const msg = verifyError.message.toLowerCase();
        setFormError(
          msg.includes('expired') || msg.includes('invalid')
            ? 'This recovery code is invalid or has expired. Check the code, or request a new one.'
            : verifyError.message || 'Failed to verify recovery code'
        );
        return;
      }

      // Step 2: Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error('Password update error:', updateError);
        setFormError(updateError.message || 'Failed to update password');
        return;
      }

      setDone(true);
      toast.success('Password reset successfully! Redirecting to login...');
      setTimeout(() => {
        router.push('/auth/login');
      }, 1500);
    } catch (err: any) {
      console.error('Reset password error:', err);
      setFormError(err?.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fieldsDisabled = loading || done;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Reset Password</h1>
          <p className="text-gray-600 mt-2">Enter your recovery code and new password</p>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              disabled={fieldsDisabled}
            />
            <p className="text-xs text-gray-500 mt-1">Must match the email you sent the recovery code to</p>
          </div>

          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
              Recovery Code
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
              disabled={fieldsDisabled}
            />
            <p className="text-xs text-gray-500 mt-1">Enter the numeric code from the recovery email</p>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              New Password
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
                disabled={fieldsDisabled}
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
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${i < strength ? strengthLevel.bar : 'bg-gray-200'}`}
                    />
                  ))}
                </div>
                <p className={`text-xs font-medium mt-1 ${strengthLevel.text}`}>Strength: {strengthLevel.label}</p>
              </div>
            )}

            <ul id="password-requirements" className="mt-2 space-y-1">
              {ruleResults.map((rule) => (
                <li
                  key={rule.id}
                  className={`flex items-center gap-1.5 text-xs ${
                    rule.passed ? 'text-green-700' : rule.required ? 'text-gray-600' : 'text-gray-400'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {rule.passed ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  {rule.label}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mt-1">Tip: 12+ characters makes your password much stronger.</p>
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
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
              disabled={fieldsDisabled}
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
            {loading ? 'Resetting...' : done ? 'Password reset' : 'Reset Password'}
          </button>
          {!canSubmit && !loading && !done && (
            <p className="text-xs text-gray-500 text-center">To continue, enter {missing.join(', ')}.</p>
          )}
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-center text-gray-600">
            <Link href="/auth/forgot-password" className="text-blue-600 hover:text-blue-700 font-semibold">
              Request New Code
            </Link>
          </p>
          <p className="text-center text-gray-600 mt-2">
            <Link href="/auth/login" className="text-blue-600 hover:text-blue-700 font-semibold">
              Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
