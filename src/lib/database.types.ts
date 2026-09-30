export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activities: {
        Row: {
          age_division: string | null;
          cancellation_policy: string | null;
          city: string;
          commission_percent: number;
          created_at: string;
          date_time: string | null;
          description: string | null;
          dispute_window_ends_at: string | null;
          entry_fee: number | null;
          format: string | null;
          host_name: string;
          host_rating: number | null;
          id: string;
          invite_code: string | null;
          is_free: boolean;
          is_private: boolean;
          kaspi_payment_link: string | null;
          location_text: string;
          manager_id: string | null;
          max_participants: number;
          notes: string | null;
          organizer_id: string | null;
          payment_mode: string;
          price_text: string | null;
          prize_pool: Json | null;
          recurrence: string | null;
          registered_count: number;
          registration_deadline: string | null;
          results_submitted_at: string | null;
          skill_division: string | null;
          skill_level: string | null;
          sport: string;
          status: Database["public"]["Enums"]["activity_status"];
          time_text: string | null;
          title: string;
          two_gis_url: string | null;
          type: Database["public"]["Enums"]["activity_type"];
          updated_at: string;
        };
        Insert: {
          age_division?: string | null;
          cancellation_policy?: string | null;
          city?: string;
          commission_percent?: number;
          created_at?: string;
          date_time?: string | null;
          description?: string | null;
          dispute_window_ends_at?: string | null;
          entry_fee?: number | null;
          format?: string | null;
          host_name?: string;
          host_rating?: number | null;
          id?: string;
          invite_code?: string | null;
          is_free?: boolean;
          is_private?: boolean;
          kaspi_payment_link?: string | null;
          location_text: string;
          manager_id?: string | null;
          max_participants: number;
          notes?: string | null;
          organizer_id?: string | null;
          payment_mode?: string;
          price_text?: string | null;
          prize_pool?: Json | null;
          recurrence?: string | null;
          registered_count?: number;
          registration_deadline?: string | null;
          results_submitted_at?: string | null;
          skill_division?: string | null;
          skill_level?: string | null;
          sport: string;
          status?: Database["public"]["Enums"]["activity_status"];
          time_text?: string | null;
          title: string;
          two_gis_url?: string | null;
          type: Database["public"]["Enums"]["activity_type"];
          updated_at?: string;
        };
        Update: {
          age_division?: string | null;
          cancellation_policy?: string | null;
          city?: string;
          commission_percent?: number;
          created_at?: string;
          date_time?: string | null;
          description?: string | null;
          dispute_window_ends_at?: string | null;
          entry_fee?: number | null;
          format?: string | null;
          host_name?: string;
          host_rating?: number | null;
          id?: string;
          invite_code?: string | null;
          is_free?: boolean;
          is_private?: boolean;
          kaspi_payment_link?: string | null;
          location_text?: string;
          manager_id?: string | null;
          max_participants?: number;
          notes?: string | null;
          organizer_id?: string | null;
          payment_mode?: string;
          price_text?: string | null;
          prize_pool?: Json | null;
          recurrence?: string | null;
          registered_count?: number;
          registration_deadline?: string | null;
          results_submitted_at?: string | null;
          skill_division?: string | null;
          skill_level?: string | null;
          sport?: string;
          status?: Database["public"]["Enums"]["activity_status"];
          time_text?: string | null;
          title?: string;
          two_gis_url?: string | null;
          type?: Database["public"]["Enums"]["activity_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity: string;
          entity_id: string | null;
          id: string;
          payload: Json;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity: string;
          entity_id?: string | null;
          id?: string;
          payload?: Json;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          payload?: Json;
        };
        Relationships: [];
      };
      content_blocks: {
        Row: {
          body: string | null;
          created_at: string;
          cta_label: string | null;
          cta_url: string | null;
          id: string;
          image_url: string | null;
          items: Json;
          kind: string;
          page: string;
          position: number;
          published: boolean;
          subtitle: string | null;
          title: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          cta_label?: string | null;
          cta_url?: string | null;
          id?: string;
          image_url?: string | null;
          items?: Json;
          kind?: string;
          page?: string;
          position?: number;
          published?: boolean;
          subtitle?: string | null;
          title?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          cta_label?: string | null;
          cta_url?: string | null;
          id?: string;
          image_url?: string | null;
          items?: Json;
          kind?: string;
          page?: string;
          position?: number;
          published?: boolean;
          subtitle?: string | null;
          title?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      disputes: {
        Row: {
          activity_id: string;
          admin_notes: string | null;
          created_at: string;
          id: string;
          reason: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          activity_id: string;
          admin_notes?: string | null;
          created_at?: string;
          id?: string;
          reason: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          activity_id?: string;
          admin_notes?: string | null;
          created_at?: string;
          id?: string;
          reason?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "disputes_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
        ];
      };
      manager_applications: {
        Row: {
          admin_notes: string | null;
          created_at: string;
          id: string;
          motivation: string | null;
          requested_role: Database["public"]["Enums"]["app_role"];
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["application_status"];
          user_id: string;
        };
        Insert: {
          admin_notes?: string | null;
          created_at?: string;
          id?: string;
          motivation?: string | null;
          requested_role?: Database["public"]["Enums"]["app_role"];
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          user_id: string;
        };
        Update: {
          admin_notes?: string | null;
          created_at?: string;
          id?: string;
          motivation?: string | null;
          requested_role?: Database["public"]["Enums"]["app_role"];
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          user_id?: string;
        };
        Relationships: [];
      };
      payment_events: {
        Row: {
          created_at: string;
          event_type: string;
          external_event_id: string | null;
          external_payment_id: string | null;
          id: string;
          payload: Json;
          processed: boolean;
          processing_error: string | null;
          provider: string;
          registration_id: string | null;
          signature_valid: boolean | null;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          external_event_id?: string | null;
          external_payment_id?: string | null;
          id?: string;
          payload?: Json;
          processed?: boolean;
          processing_error?: string | null;
          provider: string;
          registration_id?: string | null;
          signature_valid?: boolean | null;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          external_event_id?: string | null;
          external_payment_id?: string | null;
          id?: string;
          payload?: Json;
          processed?: boolean;
          processing_error?: string | null;
          provider?: string;
          registration_id?: string | null;
          signature_valid?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_events_registration_id_fkey";
            columns: ["registration_id"];
            isOneToOne: false;
            referencedRelation: "registrations";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_status_history: {
        Row: {
          activity_id: string | null;
          changed_by: string | null;
          changed_by_role: string | null;
          created_at: string;
          id: string;
          new_status: Database["public"]["Enums"]["payment_status"];
          note: string | null;
          payment_reference: string | null;
          previous_status: Database["public"]["Enums"]["payment_status"] | null;
          registration_id: string;
        };
        Insert: {
          activity_id?: string | null;
          changed_by?: string | null;
          changed_by_role?: string | null;
          created_at?: string;
          id?: string;
          new_status: Database["public"]["Enums"]["payment_status"];
          note?: string | null;
          payment_reference?: string | null;
          previous_status?:
            Database["public"]["Enums"]["payment_status"] | null;
          registration_id: string;
        };
        Update: {
          activity_id?: string | null;
          changed_by?: string | null;
          changed_by_role?: string | null;
          created_at?: string;
          id?: string;
          new_status?: Database["public"]["Enums"]["payment_status"];
          note?: string | null;
          payment_reference?: string | null;
          previous_status?:
            Database["public"]["Enums"]["payment_status"] | null;
          registration_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_status_history_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_status_history_registration_id_fkey";
            columns: ["registration_id"];
            isOneToOne: false;
            referencedRelation: "registrations";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"];
          restriction_reason: string | null;
          restriction_until: string | null;
          admin_notes: string | null;
          avatar_url: string | null;
          cancellation_count: number;
          city: string;
          created_at: string;
          dispute_count: number;
          email: string | null;
          id: string;
          kaspi_payment_link: string | null;
          name: string;
          no_show_count: number;
          phone: string | null;
          rating: number | null;
          rating_count: number;
          reliability_rating: number | null;
          sports: string[];
          updated_at: string;
          verified: boolean;
        };
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"];
          restriction_reason?: string | null;
          restriction_until?: string | null;
          admin_notes?: string | null;
          avatar_url?: string | null;
          cancellation_count?: number;
          city?: string;
          created_at?: string;
          dispute_count?: number;
          email?: string | null;
          id: string;
          kaspi_payment_link?: string | null;
          name?: string;
          no_show_count?: number;
          phone?: string | null;
          rating?: number | null;
          rating_count?: number;
          reliability_rating?: number | null;
          sports?: string[];
          updated_at?: string;
          verified?: boolean;
        };
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"];
          restriction_reason?: string | null;
          restriction_until?: string | null;
          admin_notes?: string | null;
          avatar_url?: string | null;
          cancellation_count?: number;
          city?: string;
          created_at?: string;
          dispute_count?: number;
          email?: string | null;
          id?: string;
          kaspi_payment_link?: string | null;
          name?: string;
          no_show_count?: number;
          phone?: string | null;
          rating?: number | null;
          rating_count?: number;
          reliability_rating?: number | null;
          sports?: string[];
          updated_at?: string;
          verified?: boolean;
        };
        Relationships: [];
      };
      registrations: {
        Row: {
          activity_id: string;
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          id: string;
          paid_at: string | null;
          participant_note: string | null;
          payment_reference: string | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          receipt_url: string | null;
          status: Database["public"]["Enums"]["registration_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          activity_id: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          id?: string;
          paid_at?: string | null;
          participant_note?: string | null;
          payment_reference?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          receipt_url?: string | null;
          status?: Database["public"]["Enums"]["registration_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          activity_id?: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          id?: string;
          paid_at?: string | null;
          participant_note?: string | null;
          payment_reference?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          receipt_url?: string | null;
          status?: Database["public"]["Enums"]["registration_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "registrations_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
        ];
      };
      results: {
        Row: {
          activity_id: string;
          created_at: string;
          id: string;
          paid_out: boolean;
          participant_name: string | null;
          payout_reference: string | null;
          placement: number;
          prize_amount: number | null;
          user_id: string | null;
        };
        Insert: {
          activity_id: string;
          created_at?: string;
          id?: string;
          paid_out?: boolean;
          participant_name?: string | null;
          payout_reference?: string | null;
          placement: number;
          prize_amount?: number | null;
          user_id?: string | null;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          id?: string;
          paid_out?: boolean;
          participant_name?: string | null;
          payout_reference?: string | null;
          placement?: number;
          prize_amount?: number | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "results_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          activity_id: string;
          comment: string | null;
          created_at: string;
          id: string;
          rating: number;
          reviewed_user_id: string;
          reviewer_id: string;
        };
        Insert: {
          activity_id: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          rating: number;
          reviewed_user_id: string;
          reviewer_id: string;
        };
        Update: {
          activity_id?: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          rating?: number;
          reviewed_user_id?: string;
          reviewer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
        ];
      };
      site_settings: {
        Row: {
          created_at: string;
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          created_at?: string;
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Update: {
          created_at?: string;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          activity_id: string | null;
          amount: number;
          created_at: string;
          id: string;
          provider_reference: string | null;
          status: string;
          type: string;
          user_id: string | null;
        };
        Insert: {
          activity_id?: string | null;
          amount: number;
          created_at?: string;
          id?: string;
          provider_reference?: string | null;
          status?: string;
          type: string;
          user_id?: string | null;
        };
        Update: {
          activity_id?: string | null;
          amount?: number;
          created_at?: string;
          id?: string;
          provider_reference?: string | null;
          status?: string;
          type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      event_disputes: {
        Args: { action: string; payload?: Json };
        Returns: Json;
      };
      organizer_trust: { Args: { uid: string }; Returns: Json };
      set_organizer_partner: {
        Args: { uid: string; enabled: boolean; note: string };
        Returns: undefined;
      };
      profile_maintenance: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      event_workspace: {
        Args: { action: string; payload?: Json };
        Returns: Json;
      };
      event_competition: {
        Args: { action: string; payload?: Json };
        Returns: Json;
      };
      event_feed: { Args: { filters?: Json; page?: number }; Returns: Json };
      event_public: { Args: { aid: string; code?: string }; Returns: Json };

      profile_preferences_for_feed: {
        Args: Record<string, never>;
        Returns: Json;
      };
      profile_sessions: {
        Args: { action?: string; session_id?: string };
        Returns: Json;
      };
      profile_deletion_check: { Args: Record<string, never>; Returns: Json };
      profile_workspace: {
        Args: { action: string; payload?: Json };
        Returns: Json;
      };
      public_player_profile: { Args: { _id: string }; Returns: Json };
      profile_generate_reminders: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      find_activity_by_invite: { Args: { _code: string }; Returns: string };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_activity_host: {
        Args: { _activity_id: string; _user_id: string };
        Returns: boolean;
      };
      is_admin: { Args: never; Returns: boolean };
    };
    Enums: {
      account_status: "active" | "flagged" | "suspended" | "banned";
      activity_status:
        "open" | "nearly_full" | "full" | "completed" | "cancelled";
      activity_type: "daily_game" | "tournament" | "league";
      app_role:
        | "participant"
        | "sports_manager"
        | "tournament_organizer"
        | "moderator"
        | "admin";
      application_status: "pending" | "approved" | "rejected";
      payment_status:
        "pending" | "paid" | "needs_review" | "rejected" | "refunded";
      registration_status:
        "registered" | "cancelled" | "no_show" | "attended" | "rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "flagged", "suspended", "banned"],
      activity_status: [
        "open",
        "nearly_full",
        "full",
        "completed",
        "cancelled",
      ],
      activity_type: ["daily_game", "tournament", "league"],
      app_role: [
        "participant",
        "sports_manager",
        "tournament_organizer",
        "admin",
      ],
      application_status: ["pending", "approved", "rejected"],
      payment_status: [
        "pending",
        "paid",
        "needs_review",
        "rejected",
        "refunded",
      ],
      registration_status: [
        "registered",
        "cancelled",
        "no_show",
        "attended",
        "rejected",
      ],
    },
  },
} as const;
