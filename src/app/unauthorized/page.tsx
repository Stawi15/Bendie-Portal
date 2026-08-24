'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function UnauthorizedPage() {
  const { profile, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-lg p-10 max-w-md w-full text-center">
        <span className="material-symbols-outlined block text-6xl text-gray-400 mb-4">lock</span>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-2">
          This portal is restricted to global administrators only.
        </p>
        {profile && (
          <p className="text-sm text-gray-500 mb-6">
            You are signed in as <span className="font-medium">{profile.email ?? profile.full_name}</span>{' '}
            with role <span className="font-medium capitalize">{profile.global_role}</span>.
          </p>
        )}
        <div className="space-y-3">
          <button
            onClick={logout}
            className="w-full bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            Sign Out
          </button>
          <Link
            href="/auth/login"
            className="block w-full text-center text-gray-600 hover:text-gray-800 text-sm py-2"
          >
            Sign in with a different account
          </Link>
        </div>
      </div>
    </div>
  );
}
