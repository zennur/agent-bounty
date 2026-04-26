export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          agent_type: string
          api_key_hash: string | null
          api_key_prefix: string | null
          avatar: string
          avg_completion_seconds: number
          base_price_sats: number
          categories: string[]
          created_at: string
          id: string
          is_my_agent: boolean
          name: string
          persona: string
          reputation: number
          runtime: string
          success_rate: number
          system_prompt: string | null
          total_jobs: number
          total_sats_earned: number
          user_id: string | null
          wallet_address: string | null
        }
        Insert: {
          agent_type?: string
          api_key_hash?: string | null
          api_key_prefix?: string | null
          avatar?: string
          avg_completion_seconds?: number
          base_price_sats?: number
          categories?: string[]
          created_at?: string
          id?: string
          is_my_agent?: boolean
          name: string
          persona: string
          reputation?: number
          runtime?: string
          success_rate?: number
          system_prompt?: string | null
          total_jobs?: number
          total_sats_earned?: number
          user_id?: string | null
          wallet_address?: string | null
        }
        Update: {
          agent_type?: string
          api_key_hash?: string | null
          api_key_prefix?: string | null
          avatar?: string
          avg_completion_seconds?: number
          base_price_sats?: number
          categories?: string[]
          created_at?: string
          id?: string
          is_my_agent?: boolean
          name?: string
          persona?: string
          reputation?: number
          runtime?: string
          success_rate?: number
          system_prompt?: string | null
          total_jobs?: number
          total_sats_earned?: number
          user_id?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      bounties: {
        Row: {
          buyer_agent_id: string | null
          category: string
          created_at: string
          deadline: string | null
          description: string | null
          final_price_sats: number | null
          id: string
          max_price_sats: number
          payout_error: string | null
          payout_invoice: string | null
          payout_preimage: string | null
          settled_at: string | null
          specialist_agent_id: string | null
          status: string
          submission: Json | null
          title: string
          verification: Json | null
        }
        Insert: {
          buyer_agent_id?: string | null
          category: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          final_price_sats?: number | null
          id?: string
          max_price_sats: number
          payout_error?: string | null
          payout_invoice?: string | null
          payout_preimage?: string | null
          settled_at?: string | null
          specialist_agent_id?: string | null
          status?: string
          submission?: Json | null
          title: string
          verification?: Json | null
        }
        Update: {
          buyer_agent_id?: string | null
          category?: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          final_price_sats?: number | null
          id?: string
          max_price_sats?: number
          payout_error?: string | null
          payout_invoice?: string | null
          payout_preimage?: string | null
          settled_at?: string | null
          specialist_agent_id?: string | null
          status?: string
          submission?: Json | null
          title?: string
          verification?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "bounties_buyer_agent_id_fkey"
            columns: ["buyer_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bounties_buyer_agent_id_fkey"
            columns: ["buyer_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_owner_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bounties_buyer_agent_id_fkey"
            columns: ["buyer_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bounties_specialist_agent_id_fkey"
            columns: ["specialist_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bounties_specialist_agent_id_fkey"
            columns: ["specialist_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_owner_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bounties_specialist_agent_id_fkey"
            columns: ["specialist_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          agent_id: string
          auto_approve_threshold_sats: number
          daily_total_sats: number
          id: string
          per_category_caps: Json
          spent_today_sats: number
          updated_at: string
          wallet_balance_sats: number
        }
        Insert: {
          agent_id: string
          auto_approve_threshold_sats?: number
          daily_total_sats?: number
          id?: string
          per_category_caps?: Json
          spent_today_sats?: number
          updated_at?: string
          wallet_balance_sats?: number
        }
        Update: {
          agent_id?: string
          auto_approve_threshold_sats?: number
          daily_total_sats?: number
          id?: string
          per_category_caps?: Json
          spent_today_sats?: number
          updated_at?: string
          wallet_balance_sats?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents_owner_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_sats: number
          bounty_id: string | null
          created_at: string
          from_agent_id: string | null
          id: string
          status: string
          to_agent_id: string | null
        }
        Insert: {
          amount_sats: number
          bounty_id?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          status?: string
          to_agent_id?: string | null
        }
        Update: {
          amount_sats?: number
          bounty_id?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          status?: string
          to_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bounty_id_fkey"
            columns: ["bounty_id"]
            isOneToOne: false
            referencedRelation: "bounties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_owner_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_owner_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_topups: {
        Row: {
          agent_id: string
          amount_sats: number
          created_at: string
          id: string
          invoice: string
          payment_hash: string
          settled_at: string | null
          status: string
        }
        Insert: {
          agent_id: string
          amount_sats: number
          created_at?: string
          id?: string
          invoice: string
          payment_hash: string
          settled_at?: string | null
          status?: string
        }
        Update: {
          agent_id?: string
          amount_sats?: number
          created_at?: string
          id?: string
          invoice?: string
          payment_hash?: string
          settled_at?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      agents_owner_view: {
        Row: {
          agent_type: string | null
          api_key_hash: string | null
          api_key_prefix: string | null
          avatar: string | null
          avg_completion_seconds: number | null
          base_price_sats: number | null
          categories: string[] | null
          created_at: string | null
          id: string | null
          is_my_agent: boolean | null
          name: string | null
          persona: string | null
          reputation: number | null
          runtime: string | null
          success_rate: number | null
          system_prompt: string | null
          total_jobs: number | null
          total_sats_earned: number | null
          user_id: string | null
          wallet_address: string | null
        }
        Insert: {
          agent_type?: string | null
          api_key_hash?: string | null
          api_key_prefix?: string | null
          avatar?: string | null
          avg_completion_seconds?: number | null
          base_price_sats?: number | null
          categories?: string[] | null
          created_at?: string | null
          id?: string | null
          is_my_agent?: boolean | null
          name?: string | null
          persona?: string | null
          reputation?: number | null
          runtime?: string | null
          success_rate?: number | null
          system_prompt?: string | null
          total_jobs?: number | null
          total_sats_earned?: number | null
          user_id?: string | null
          wallet_address?: string | null
        }
        Update: {
          agent_type?: string | null
          api_key_hash?: string | null
          api_key_prefix?: string | null
          avatar?: string | null
          avg_completion_seconds?: number | null
          base_price_sats?: number | null
          categories?: string[] | null
          created_at?: string | null
          id?: string | null
          is_my_agent?: boolean | null
          name?: string | null
          persona?: string | null
          reputation?: number | null
          runtime?: string | null
          success_rate?: number | null
          system_prompt?: string | null
          total_jobs?: number | null
          total_sats_earned?: number | null
          user_id?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      agents_public: {
        Row: {
          agent_type: string | null
          avatar: string | null
          avg_completion_seconds: number | null
          base_price_sats: number | null
          categories: string[] | null
          created_at: string | null
          id: string | null
          is_my_agent: boolean | null
          name: string | null
          persona: string | null
          reputation: number | null
          runtime: string | null
          success_rate: number | null
          total_jobs: number | null
          total_sats_earned: number | null
          user_id: string | null
        }
        Insert: {
          agent_type?: string | null
          avatar?: string | null
          avg_completion_seconds?: number | null
          base_price_sats?: number | null
          categories?: string[] | null
          created_at?: string | null
          id?: string | null
          is_my_agent?: boolean | null
          name?: string | null
          persona?: string | null
          reputation?: number | null
          runtime?: string | null
          success_rate?: number | null
          total_jobs?: number | null
          total_sats_earned?: number | null
          user_id?: string | null
        }
        Update: {
          agent_type?: string | null
          avatar?: string | null
          avg_completion_seconds?: number | null
          base_price_sats?: number | null
          categories?: string[] | null
          created_at?: string | null
          id?: string | null
          is_my_agent?: boolean | null
          name?: string | null
          persona?: string | null
          reputation?: number | null
          runtime?: string | null
          success_rate?: number | null
          total_jobs?: number | null
          total_sats_earned?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      user_owns_agent: { Args: { _agent_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
