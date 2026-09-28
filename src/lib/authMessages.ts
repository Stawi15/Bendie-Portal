/**
 * Feature 016 (reliability pass) — plain-language messages for Supabase Auth
 * failures on the sign-in / sign-up / password-recovery screens. Never shows
 * raw Supabase wording or error codes; the raw error is logged for developers.
 */

type AuthErrorLike = { message?: string | null; code?: string | null; status?: number } | null | undefined;

export function authErrorMessage(err: AuthErrorLike, fallback = 'Something didn’t work. Please try again.'): string {
  if (err) console.error('[auth]', err);
  const m = (err?.message ?? '').toLowerCase();
  const code = (err?.code ?? '').toLowerCase();

  if (code === 'invalid_credentials' || m.includes('invalid login credentials')) return 'That email and password don’t match. Check them and try again.';
  if (code === 'email_not_confirmed' || m.includes('email not confirmed')) return 'Please confirm your email address first — check your inbox for the confirmation email.';
  if (code === 'user_already_exists' || m.includes('already registered')) return 'An account with this email already exists. Sign in instead, or reset your password.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || err?.status === 429 || m.includes('rate limit') || m.includes('for security purposes')) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  if (code === 'same_password' || m.includes('should be different')) return 'Choose a new password you haven’t used for this account before.';
  if (code === 'weak_password' || m.includes('password should') || m.includes('weak password')) {
    return 'That password isn’t strong enough. Follow the requirements listed below the password field.';
  }
  if (code === 'email_address_invalid' || m.includes('validate email') || m.includes('invalid format')) {
    return 'Enter a valid email address, for example name@company.com.';
  }
  // Reset link/code errors — matched by Supabase's specific codes/phrases only, so ordinary
  // sign-in or sign-up errors that merely contain "invalid"/"not found" never get this copy.
  if (code === 'otp_expired' || code === 'flow_state_expired' || m.includes('token has expired')) {
    return 'This reset link or code has expired. Request a new one.';
  }
  if (code === 'otp_disabled' || code === 'bad_code_verifier' || code === 'flow_state_not_found' || (m.includes('token') && m.includes('invalid'))) {
    return 'This reset link or code isn’t valid. Check it, or request a new one.';
  }
  if (m.includes('auth session missing') || m.includes('session_not_found')) return 'Your reset session has ended. Request a new reset link.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'We couldn’t reach the server. Check your internet connection and try again.';
  return fallback;
}
