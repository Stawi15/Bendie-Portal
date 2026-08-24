'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Event Content Portal</h1>
          <p className="text-gray-600 mb-6">
            Admin panel for managing event content, branding, and settings
          </p>
          <Link
            href="/auth/login"
            className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-6">Welcome, {user.email}!</h1>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">
            Portal initialization complete. Navigate to your events to begin.
          </p>
          <Link
            href="/portal"
            className="mt-4 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
