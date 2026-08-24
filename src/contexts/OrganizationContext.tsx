'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessibleOrganizations } from '@/lib/portalAuth';
import type { Database } from '@/types/database';

type Organization = Database['public']['Tables']['organizations']['Row'];

export interface OrganizationContextType {
  organizationId: string | null;
  organization: Organization | null;
  organizations: Organization[];
  loading: boolean;
  error: string | null;
  setCurrentOrganization: (organizationId: string) => Promise<void>;
  addOrganization: (organization: Organization) => void;
}

export const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const { profile, loading: authLoading } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    const resolveOrganization = async () => {
      setLoading(true);
      setError(null);

      try {
        const accessible = await getAccessibleOrganizations();
        setOrganizations(accessible);

        // Prefer the user's saved default, but only if they can still access it —
        // otherwise fall back to the first organisation they can see.
        let resolved = accessible.find((o) => o.id === profile?.current_organization_id) ?? null;

        if (!resolved && accessible.length > 0) {
          resolved = accessible[0];
        }

        if (!resolved) {
          setOrganizationId(null);
          setOrganization(null);
          setError('No organisation found');
          return;
        }

        setOrganizationId(resolved.id);
        setOrganization(resolved);
      } catch (err) {
        setError('Error resolving organisation');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    resolveOrganization();
  }, [authLoading, profile?.current_organization_id, profile?.id]);

  const setCurrentOrganization = useCallback(
    async (id: string) => {
      const next = organizations.find((o) => o.id === id);
      if (!next || next.id === organizationId) return;

      setOrganizationId(next.id);
      setOrganization(next);

      // Best-effort: remember this as the user's default for next time.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ current_organization_id: next.id })
          .eq('id', user.id);
        if (updateError) console.error('Failed to save organisation selection:', updateError);
      }
    },
    [organizations, organizationId]
  );

  const addOrganization = useCallback((org: Organization) => {
    setOrganizations((prev) => [...prev, org]);
    setOrganizationId(org.id);
    setOrganization(org);

    // Best-effort: remember this as the user's default for next time.
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ current_organization_id: org.id })
        .eq('id', user.id);
      if (updateError) console.error('Failed to save organisation selection:', updateError);
    })();
  }, []);

  return (
    <OrganizationContext.Provider
      value={{ organizationId, organization, organizations, loading, error, setCurrentOrganization, addOrganization }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
};
