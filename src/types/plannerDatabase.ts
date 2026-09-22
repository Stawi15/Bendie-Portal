// Hand-maintained Supabase Database type for Bendie Planner's separate
// project — same convention as src/types/database.ts (not generated),
// but a second file since Planner is a genuinely different database
// (bigint/serial IDs, its own auth.users realm). Only includes the
// tables this integration actually reads/writes; live-verified this
// session, re-verify via the supabase-planner MCP if drift is suspected.

export interface PlannerDatabase {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          first_name: string | null;
          full_name: string | null;
          email: string | null;
          role: string | null;
          gender: string | null;
          avatar_url: string | null;
          is_platform_admin: boolean;
          organization_id: number | null;
          is_org_admin: boolean;
        };
      };
      events: {
        Row: {
          event_id: number;
          event_title: string;
          location: string | null;
          setup_date: string | null;
          start_date: string | null;
          end_date: string | null;
          attendees: number | null;
          description: string | null;
          event_code: string;
          organization_id: number;
        };
      };
      event_user_assignments: {
        Row: {
          assignment_id: number;
          event_id: number;
          profile_id: string;
          access_role: string;
          can_view_overview: boolean;
          can_view_production: boolean;
          can_view_logistics: boolean;
          can_view_tasks: boolean;
          can_view_notifications: boolean;
          can_view_checklist: boolean;
          can_view_vendors: boolean;
          can_manage_tasks: boolean;
          can_manage_checklist: boolean;
          can_manage_vendors: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          assignment_id?: number;
          event_id: number;
          profile_id: string;
          access_role?: string;
          can_view_overview?: boolean;
          can_view_production?: boolean;
          can_view_logistics?: boolean;
          can_view_tasks?: boolean;
          can_view_notifications?: boolean;
          can_view_checklist?: boolean;
          can_view_vendors?: boolean;
          can_manage_tasks?: boolean;
          can_manage_checklist?: boolean;
          can_manage_vendors?: boolean;
          is_active?: boolean;
        };
      };
      event_agenda_items: {
        Row: {
          agenda_item_id: number;
          event_id: number;
          day_number: number | null;
          day_label: string | null;
          agenda_date: string | null;
          start_at: string | null;
          end_at: string | null;
          start_time: string | null;
          end_time: string | null;
          item_title: string;
          subtitle: string | null;
          description: string | null;
          speakers: string | null;
          mc: string | null;
          track_name: string | null;
          room_name: string | null;
          item_type: string | null;
          sort_order: number;
          is_parallel: boolean;
          source_document: string | null;
          notes: string | null;
          source_portal_session_id: string | null;
        };
        Insert: {
          agenda_item_id?: number;
          event_id: number;
          day_number?: number | null;
          day_label?: string | null;
          agenda_date?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          item_title: string;
          subtitle?: string | null;
          description?: string | null;
          speakers?: string | null;
          mc?: string | null;
          track_name?: string | null;
          room_name?: string | null;
          item_type?: string | null;
          sort_order?: number;
          is_parallel?: boolean;
          source_document?: string | null;
          notes?: string | null;
          source_portal_session_id?: string | null;
        };
      };
      passengers: {
        Row: {
          passenger_id: number;
          passport: string | null;
          full_name: string;
          title: string | null;
          dietary_requirements: string | null;
          gender: string | null;
          email: string | null;
          phone: string | null;
        };
      };
      all_flights_combined_table: {
        Row: {
          record_id: number;
          fullname: string | null;
          flight: string | null;
          departuretime: string | null;
          arrivaltime: string | null;
          date_time: string | null;
          stops: string | null;
          notes: string | null;
          flight_type: string | null;
          depart_time: string | null;
          arrive_time: string | null;
          event_id: number;
          passenger_id: number | null;
        };
      };
      hotel_bookings: {
        Row: {
          booking_id: number;
          event_id: number;
          passenger_id: number;
          hotel_name: string | null;
          room_number: number | null;
          rooming_label: string | null;
          check_in_date: string | null;
          check_out_date: string | null;
          notes: string | null;
        };
      };
      /**
       * Feature 007 — `operational_tasks`, existing live table, read/write from
       * this feature. Deliberately narrowed, matching this file's own convention
       * (see `event_summary_realtime` below): omits `assigned_to` (legacy `users`
       * FK, unused), the trigger-derived `pending`/`active`/`completed` booleans
       * (never set directly — `enforce_operational_task_status()` derives them),
       * and three additional live columns confirmed present via a fresh
       * `information_schema` query during `/speckit.analyze` but never read or
       * written by this feature: `responsible_party` (legacy free-text, superseded
       * by `assigned_profile_id`), `source_ref`, `metadata` (`jsonb`, defaulted).
       * `PlannerDatabase` is never used as a generic type parameter anywhere in
       * this codebase (confirmed via `grep`) — this block is a hand-maintained
       * documentation/reference only, matching every other block in this file.
       */
      operational_tasks: {
        Row: {
          task_id: number;
          event_id: number | null;
          task_code: string | null;
          task: string;
          category: string | null;
          status: string | null;
          priority: string | null;
          due_date: string | null;
          remarks: string | null;
          assigned_profile_id: string | null;
          created_by_profile_id: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          task_id?: number;
          event_id: number;
          task_code?: string | null;
          task: string;
          category?: string | null;
          status?: string | null;
          priority?: string | null;
          due_date?: string | null;
          remarks?: string | null;
          assigned_profile_id?: string | null;
          created_by_profile_id?: string | null;
        };
      };
      /**
       * Feature 009 — `event_vendor_items`, existing live table, read/write from
       * this feature. Canonical source of truth for Bendie Planner vendor items;
       * no Portal-side copy exists. `is_packed`/`is_loaded`/`is_on_site` and their
       * paired `*_at`/`*_by_profile_id` columns are database-trigger-governed
       * (`trg_enforce_vendor_item_stage_order`, `trg_prevent_unsafe_vendor_item_edit`
       * — see data-model.md §2): the trigger enforces packed→loaded→on-site
       * ordering/cascade and re-stamps each stage's timestamp/actor on change,
       * deriving the actor from `auth.uid()` (always null for this feature's
       * service-role writes). `category`/`item_description`/`quantity_text`/`unit`/
       * `sort_order` are immutable after creation through this feature (the same
       * trigger raises an exception on any such edit without a live Planner
       * session) — `notes` is deliberately excluded from that guard and remains
       * editable. `PlannerDatabase` is never used as a generic type parameter
       * anywhere in this codebase — this block is hand-maintained documentation
       * only, matching every other block in this file.
       */
      event_vendor_items: {
        Row: {
          vendor_item_id: number;
          event_id: number;
          category: string;
          item_description: string;
          quantity_text: string | null;
          unit: string | null;
          sort_order: number;
          is_packed: boolean;
          packed_at: string | null;
          packed_by_profile_id: string | null;
          is_loaded: boolean;
          loaded_at: string | null;
          loaded_by_profile_id: string | null;
          is_on_site: boolean;
          on_site_at: string | null;
          on_site_by_profile_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by_profile_id: string | null;
        };
        Insert: {
          vendor_item_id?: number;
          event_id: number;
          category?: string;
          item_description: string;
          quantity_text?: string | null;
          unit?: string | null;
          sort_order?: number;
          notes?: string | null;
          created_by_profile_id?: string | null;
        };
      };
      /**
       * Feature 005 — a materialized view (`~1 minute` `pg_cron` refresh),
       * one row per event including zero-session events. Only the columns
       * Feature 005's Planner Overview actually reads are declared here —
       * `event_id` and `attendees` also exist on the live row but are
       * deliberately omitted from this type so they can never be selected
       * by accident (data-model.md; FR-004/FR-015). Do NOT use
       * `session_status_realtime`/`session_summary_realtime`/
       * `overall_session_summary` — verified unreliable, excluded.
       */
      event_summary_realtime: {
        Row: {
          event_title: string;
          description: string | null;
          location: string | null;
          setup_date: string | null;
          start_date: string | null;
          end_date: string | null;
          number_of_sessions: number;
          status: string;
        };
      };
    };
  };
}
