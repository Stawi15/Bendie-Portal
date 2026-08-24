// ─── Enum types matching Supabase USER-DEFINED types ──────────────────────────
export type AppRole = 'host' | 'organizer' | 'admin' | 'attendee' | 'facilitator' | 'staff' | 'speaker';
export type EventStatus = 'draft' | 'published' | 'active' | 'completed' | 'archived';
export type EventType = 'conference' | 'teambuilding' | 'hybrid';
export type NetworkingMode = 'full' | 'attendees_only' | 'disabled';
export type AgendaAudience = 'everyone' | string;
export type ConnectionStatus = 'pending' | 'accepted' | 'declined' | 'blocked';
export type EmergencyContactType = 'general' | string;
export type ClaimStatus = 'unclaimed' | 'claimed';
export type MessageType = 'text' | 'image' | 'audio' | 'emoji';
export type MediaType = 'gallery' | 'featured' | string;
export type GameType = 'jeopardy' | 'kmky';
export type NotificationType = string;
export type OnboardingStatus = 'pending' | 'in_progress' | 'completed';
export type OrgMemberRole = 'owner' | 'admin' | 'member' | 'attendee' | 'facilitator' | 'staff';
export type EventMemberRole = 'host' | 'organizer' | 'admin' | 'attendee' | 'facilitator' | 'staff' | 'speaker';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          full_name: string | null;
          email: string | null;
          avatar_url: string | null;
          role: AppRole;
          bio: string | null;
          phone: string | null;
          job_title: string | null;
          organization: string | null;
          location: string | null;
          is_onboarded: boolean;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
          gender: 'male' | 'female' | 'other' | null;
          current_organization_id: string | null;
          current_event_id: string | null;
          global_role: AppRole;
        };
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: OrgMemberRole;
          created_at: string;
        };
      };
      teams: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          created_by: string | null;
          created_at: string;
        };
      };
      team_members: {
        Row: {
          team_id: string;
          user_id: string;
          created_at: string;
        };
      };
      organization_audit_log: {
        Row: {
          id: string;
          organization_id: string;
          table_name: string;
          action: 'INSERT' | 'UPDATE' | 'DELETE';
          row_id: string | null;
          diff: Record<string, unknown> | null;
          actor_user_id: string | null;
          created_at: string;
        };
      };
      organization_assets: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          url: string;
          storage_path: string;
          file_type: string | null;
          size_bytes: number | null;
          uploaded_by: string | null;
          created_at: string;
        };
      };
      events: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          slug: string | null;
          description: string | null;
          location: string | null;
          status: EventStatus;
          attendee_limit: number | null;
          starts_at: string | null;
          ends_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          image_url: string | null;
          hero_title: string | null;
          hero_description: string | null;
          hero_image_url: string | null;
          category_label: string | null;
          theme_label: string | null;
          theme_icon: string | null;
          facilitator_label_singular: string | null;
          facilitator_label_plural: string | null;
          gallery_external_url: string | null;
          event_type: EventType;
          networking_mode: NetworkingMode;
          interests_enabled: boolean;
          feedback_form_url: string | null;
          theme_primary: string | null;
          theme_secondary: string | null;
          theme_tertiary: string | null;
          profile_banner_image_url: string | null;
          in_house: boolean;
          gallery_background: string | null;
          disabled_menu_items: string[];
        };
      };
      event_members: {
        Row: {
          event_id: string;
          user_id: string;
          organization_id: string;
          role: EventMemberRole;
          onboarding_status: OnboardingStatus;
          onboarding_completed_at: string | null;
          invited_by: string | null;
          created_at: string;
        };
      };
      facilitators: {
        Row: {
          id: string;
          user_id: string | null;
          full_name: string | null;
          email: string | null;
          job_title: string | null;
          organization: string | null;
          avatar_url: string | null;
          bio: string | null;
          facilitator_group: string | null;
          role_type: 'speaker' | 'presenter';
          linkedin_url: string | null;
          expertise: string | null;
          claim_status: ClaimStatus;
          claimed_at: string | null;
          display_order: number;
          created_at: string;
          updated_at: string;
          event_id: string | null;
        };
      };
      agenda_sessions: {
        Row: {
          id: string;
          event_id: string | null;
          title: string;
          description: string | null;
          starts_at: string;
          ends_at: string;
          location: string | null;
          audience: AgendaAudience;
          facilitator_id: string | null;
          accent_color: string | null;
          display_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          block_type: 'session' | 'activity' | 'meal' | 'transfer' | 'freetime' | 'ceremony' | 'break' | null;
          breakout_rooms: unknown | null;
        };
      };
      agenda_session_speakers: {
        Row: {
          id: string;
          session_id: string;
          facilitator_id: string;
          speaker_type: 'speaker' | 'panelist' | 'moderator' | 'facilitator' | 'host';
          display_order: number;
          created_at: string;
        };
      };
      activities: {
        Row: {
          id: string;
          event_id: string | null;
          title: string;
          slug: string | null;
          description: string | null;
          rating: number | null;
          location: string | null;
          is_featured: boolean;
          display_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      activity_images: {
        Row: {
          id: string;
          activity_id: string;
          image_url: string;
          image_type: MediaType;
          alt_text: string | null;
          display_order: number;
          created_at: string;
        };
      };
      faqs: {
        Row: {
          id: string;
          event_id: string | null;
          section: string;
          question: string;
          answer: string;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
      };
      games: {
        Row: {
          id: string;
          event_id: string | null;
          title: string;
          description: string | null;
          type: GameType;
          image_url: string | null;
          background_color: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      game_questions: {
        Row: {
          id: string;
          game_id: string;
          category: string | null;
          question: string;
          correct_answer: string | null;
          answer_options: Record<string, unknown> | null;
          points: number;
          display_order: number;
          created_at: string;
        };
      };
      game_results: {
        Row: {
          id: string;
          game_id: string;
          user_id: string;
          score: number;
          answers: Record<string, unknown> | null;
          created_at: string;
        };
      };
      event_photos: {
        Row: {
          id: string;
          event_id: string | null;
          image_url: string;
          caption: string | null;
          uploaded_by: string | null;
          is_featured: boolean;
          display_order: number;
          created_at: string;
        };
      };
      excursion_categories: {
        Row: {
          id: string;
          event_id: string | null;
          key: string;
          label: string;
          icon: string | null;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
      };
      excursions: {
        Row: {
          id: string;
          event_id: string | null;
          category_id: string;
          title: string;
          description: string | null;
          image_url: string | null;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
      };
      expo_spaces: {
        Row: {
          id: string;
          event_id: string | null;
          name: string;
          summary: string | null;
          image_url: string | null;
          chips: string[];
          intro: string | null;
          offering: string | null;
          contact_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          cta_description: string | null;
          is_exhibitor: boolean;
          is_sponsor: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
      };
      news_items: {
        Row: {
          id: string;
          event_id: string | null;
          title: string;
          summary: string | null;
          body: string | null;
          themes: string[];
          image_url: string | null;
          is_featured: boolean;
          registration_url: string | null;
          read_time_minutes: number | null;
          published_at: string;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
      };
      attendee_travel_details: {
        Row: {
          id: string;
          user_id: string;
          event_id: string | null;
          type: 'flight' | 'ground_transfer' | 'other';
          title: string | null;
          boarding_time: string | null;
          route: string | null;
          origin: string | null;
          destination: string | null;
          travel_time: string | null;
          pickup_vehicle: string | null;
          pickup_location: string | null;
          date: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      emergency_contacts: {
        Row: {
          id: string;
          event_id: string | null;
          name: string;
          phone: string;
          type: EmergencyContactType;
          display_order: number;
          created_at: string;
          image_url: string | null;
          location: string | null;
          description: string | null;
        };
      };
      emergency_images: {
        Row: {
          id: string;
          event_id: string;
          image_url: string;
          caption: string | null;
          display_order: number;
          created_at: string;
        };
      };
      support_contacts: {
        Row: {
          id: string;
          event_id: string | null;
          name: string;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          contact_group: string | null;
          display_order: number;
          created_at: string;
        };
      };
      event_interest_options: {
        Row: {
          id: string;
          event_id: string;
          question_key: string;
          question_label: string | null;
          question_type: 'single_select' | 'multi_select' | 'short_text' | 'long_text';
          option_key: string | null;
          option_label: string | null;
          display_order: number;
          is_required: boolean;
          created_at: string;
        };
      };
      posts: {
        Row: {
          id: string;
          event_id: string | null;
          user_id: string;
          image_url: string;
          caption: string | null;
          is_hidden: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      connections: {
        Row: {
          id: string;
          event_id: string | null;
          requester_id: string;
          receiver_id: string;
          status: ConnectionStatus;
          created_at: string;
          updated_at: string;
        };
      };
      networking_preferences: {
        Row: {
          user_id: string;
          event_id: string;
          role: string;
          objectives: string[];
          sectors: string[];
          project_stages: string[];
          investor_ticket_size: string | null;
          investor_preferred_sectors: string[];
          investor_risk: string | null;
          gov_has_projects: string | null;
          gov_sector_focus: string[];
          private_goals: string[];
          advisor_expertise: string[];
          short_intro: string;
          organization_name: string;
          location: string | null;
          availability: string[];
          meeting_preference: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          event_id: string | null;
          user_id: string;
          type: NotificationType;
          title: string;
          subtitle: string | null;
          body: string | null;
          related_type: string | null;
          related_id: string | null;
          read_at: string | null;
          created_at: string;
        };
      };
      feedback: {
        Row: {
          id: string;
          event_id: string | null;
          user_id: string | null;
          favorite_moments: string | null;
          app_experience: number | null;
          improvements: string | null;
          suggestions: string | null;
          created_at: string;
        };
      };
      event_user_access_codes: {
        Row: {
          id: string;
          event_id: string;
          organization_id: string;
          user_id: string;
          code_hash: string;
          code_last4: string;
          issued_by: string | null;
          issued_at: string;
          expires_at: string;
          used_at: string | null;
          is_active: boolean;
          attempt_count: number;
        };
      };
    };
  };
}
