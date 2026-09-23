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
      expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          expense_date: string
          id: string
          merchant: string | null
          notes: string | null
          property_id: string
          property_label: string
          receipt_path: string | null
          service_call_id: string | null
          technician_id: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          expense_date: string
          id?: string
          merchant?: string | null
          notes?: string | null
          property_id: string
          property_label: string
          receipt_path?: string | null
          service_call_id?: string | null
          technician_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          expense_date?: string
          id?: string
          merchant?: string | null
          notes?: string | null
          property_id?: string
          property_label?: string
          receipt_path?: string | null
          service_call_id?: string | null
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      service_call_photos: {
        Row: {
          created_at: string
          id: string
          service_call_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_call_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          service_call_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_call_photos_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      service_calls: {
        Row: {
          call_date: string
          call_type: string
          created_at: string
          description: string | null
          follow_up_needed: boolean
          follow_up_notes: string | null
          hours_type: string
          id: string
          property_id: string
          property_label: string
          approval_status: string
          routed_to_chief_id: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
          property_id_2: string | null
          property_label_2: string | null
          space_id_2: string | null
          space_label_2: string | null
          rate_id: string | null
          billed_label: string | null
          billed_amount: number | null
          space_id: string | null
          space_label: string | null
          technician_id: string
          updated_at: string
        }
        Insert: {
          call_date: string
          call_type: string
          created_at?: string
          description?: string | null
          follow_up_needed?: boolean
          follow_up_notes?: string | null
          hours_type: string
          id?: string
          property_id: string
          property_label: string
          approval_status?: string
          routed_to_chief_id?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          property_id_2?: string | null
          property_label_2?: string | null
          space_id_2?: string | null
          space_label_2?: string | null
          rate_id?: string | null
          billed_label?: string | null
          billed_amount?: number | null
          space_id?: string | null
          space_label?: string | null
          technician_id: string
          updated_at?: string
        }
        Update: {
          call_date?: string
          call_type?: string
          created_at?: string
          description?: string | null
          follow_up_needed?: boolean
          follow_up_notes?: string | null
          hours_type?: string
          id?: string
          property_id?: string
          property_label?: string
          approval_status?: string
          routed_to_chief_id?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          property_id_2?: string | null
          property_label_2?: string | null
          space_id_2?: string | null
          space_label_2?: string | null
          rate_id?: string | null
          billed_label?: string | null
          billed_amount?: number | null
          space_id?: string | null
          space_label?: string | null
          technician_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_calls_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          property_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          property_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_rates: {
        Row: {
          id: string
          technician_id: string
          label: string
          amount: number
          sort_order: number
          is_primary: boolean
          created_at: string
        }
        Insert: {
          id?: string
          technician_id: string
          label: string
          amount: number
          sort_order?: number
          is_primary?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          technician_id?: string
          label?: string
          amount?: number
          sort_order?: number
          is_primary?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_rates_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technicians: {
        Row: {
          active: boolean
          company: string | null
          created_at: string
          failed_pin_attempts: number
          id: string
          is_admin: boolean
          is_chief: boolean
          chief_id: string | null
          kind: string
          locked_until: string | null
          name: string
          pin_hash: string | null
        }
        Insert: {
          active?: boolean
          company?: string | null
          created_at?: string
          failed_pin_attempts?: number
          id?: string
          is_admin?: boolean
          is_chief?: boolean
          chief_id?: string | null
          kind?: string
          locked_until?: string | null
          name: string
          pin_hash?: string | null
        }
        Update: {
          active?: boolean
          company?: string | null
          created_at?: string
          failed_pin_attempts?: number
          id?: string
          is_admin?: boolean
          is_chief?: boolean
          chief_id?: string | null
          kind?: string
          locked_until?: string | null
          name?: string
          pin_hash?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      property_usage: {
        Row: {
          property_id: string | null
          service_call_count: number | null
          expense_count: number | null
        }
        Relationships: []
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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

export const Constants = {
  public: {
    Enums: {},
  },
} as const
