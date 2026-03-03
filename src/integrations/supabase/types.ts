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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_log: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          invoice_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          invoice_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachment_path: string | null
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          attachment_path?: string | null
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          attachment_path?: string | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      email_contacts: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string
          id: string
          reachable: boolean | null
          sender_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email: string
          id?: string
          reachable?: boolean | null
          sender_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          reachable?: boolean | null
          sender_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      invoice_categories: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      invoice_threads: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          thread_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          thread_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          category_id: string | null
          created_at: string
          currency: string | null
          description: string | null
          document_hash: string | null
          document_path: string | null
          due_date: string | null
          follow_up_count: number
          human_notified_at: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          last_followed_up_at: string | null
          line_items: Json | null
          payment_status: string
          processing_status: string
          project_id: string | null
          subtotal: number | null
          total: number | null
          updated_at: string | null
          user_id: string
          vat: number | null
          vendor_name: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          document_hash?: string | null
          document_path?: string | null
          due_date?: string | null
          follow_up_count?: number
          human_notified_at?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          last_followed_up_at?: string | null
          line_items?: Json | null
          payment_status?: string
          processing_status?: string
          project_id?: string | null
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
          user_id: string
          vat?: number | null
          vendor_name?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          document_hash?: string | null
          document_path?: string | null
          due_date?: string | null
          follow_up_count?: number
          human_notified_at?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          last_followed_up_at?: string | null
          line_items?: Json | null
          payment_status?: string
          processing_status?: string
          project_id?: string | null
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
          user_id?: string
          vat?: number | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_new_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "invoice_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      project_categories: {
        Row: {
          budget: number
          category_id: string
          created_at: string
          id: string
          project_id: string
        }
        Insert: {
          budget?: number
          category_id: string
          created_at?: string
          id?: string
          project_id: string
        }
        Update: {
          budget?: number
          category_id?: string
          created_at?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "invoice_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_categories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          file_name: string
          id: string
          project_id: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          file_name: string
          id?: string
          project_id: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          file_name?: string
          id?: string
          project_id?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          budget: number | null
          created_at: string | null
          description: string | null
          id: string
          known_locations: string[] | null
          known_vendors: string[] | null
          name: string
          status: string | null
          user_id: string
        }
        Insert: {
          budget?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          known_locations?: string[] | null
          known_vendors?: string[] | null
          name: string
          status?: string | null
          user_id: string
        }
        Update: {
          budget?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          known_locations?: string[] | null
          known_vendors?: string[] | null
          name?: string
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          agentmail_inbox: string | null
          base_currency: string
          company_name: string | null
          created_at: string
          email_address: string | null
          email_provider: string
          id: string
          max_followups: number
          notification_channel: string
          onboarding_done: boolean
        }
        Insert: {
          agentmail_inbox?: string | null
          base_currency?: string
          company_name?: string | null
          created_at?: string
          email_address?: string | null
          email_provider?: string
          id: string
          max_followups?: number
          notification_channel?: string
          onboarding_done?: boolean
        }
        Update: {
          agentmail_inbox?: string | null
          base_currency?: string
          company_name?: string | null
          created_at?: string
          email_address?: string | null
          email_provider?: string
          id?: string
          max_followups?: number
          notification_channel?: string
          onboarding_done?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
