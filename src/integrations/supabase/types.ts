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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      product_groups: {
        Row: {
          code: string
          created_at: string
          discount_percent: number
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          discount_percent?: number
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          discount_percent?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          code: string
          created_at: string
          group_id: string
          id: string
          name: string
          price: number
          unit: string
        }
        Insert: {
          code: string
          created_at?: string
          group_id: string
          id?: string
          name: string
          price: number
          unit: string
        }
        Update: {
          code?: string
          created_at?: string
          group_id?: string
          id?: string
          name?: string
          price?: number
          unit?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          book_no: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          book_no?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          book_no?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          created_at: string
          id: string
          inventory_no: string
          product_id: string
          quantity: number
          received_quantity: number
          status: string
          supplier_name: string | null
          supplier_bill_no: string | null
          cost: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_no: string
          product_id: string
          quantity: number
          received_quantity?: number
          status?: string
          supplier_name?: string | null
          supplier_bill_no?: string | null
          cost?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          inventory_no?: string
          product_id?: string
          quantity?: number
          received_quantity?: number
          status?: string
          supplier_name?: string | null
          supplier_bill_no?: string | null
          cost?: number | null
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          amount: number
          id: string
          inventory_item_id: string | null
          inventory_no: string
          invoice_id: string
          product_id: string
          quantity: number
          rate: number
        }
        Insert: {
          amount: number
          id?: string
          inventory_item_id?: string | null
          inventory_no: string
          invoice_id: string
          product_id: string
          quantity: number
          rate: number
        }
        Update: {
          amount?: number
          id?: string
          inventory_item_id?: string | null
          inventory_no?: string
          invoice_id?: string
          product_id?: string
          quantity?: number
          rate?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          bill_no: string
          billed_on: string
          created_at: string
          customer_id: string
          id: string
          remarks: string | null
          status: string
        }
        Insert: {
          bill_no: string
          billed_on?: string
          created_at?: string
          customer_id: string
          id?: string
          remarks?: string | null
          status?: string
        }
        Update: {
          bill_no?: string
          billed_on?: string
          created_at?: string
          customer_id?: string
          id?: string
          remarks?: string | null
          status?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          paid_on: string
          showroom: string | null
          mode: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          paid_on?: string
          showroom?: string | null
          mode?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          paid_on?: string
          showroom?: string | null
          mode?: string | null
        }
        Relationships: []
      }
      stitching_measurement_fields: {
        Row: {
          id: string
          label: string
          sort_order: number
          stitching_product_id: string
        }
        Insert: {
          id?: string
          label: string
          sort_order?: number
          stitching_product_id: string
        }
        Update: {
          id?: string
          label?: string
          sort_order?: number
          stitching_product_id?: string
        }
        Relationships: []
      }
      stitching_order_measurements: {
        Row: {
          id: string
          label: string
          order_id: string
          sort_order: number
          value: string
        }
        Insert: {
          id?: string
          label: string
          order_id: string
          sort_order?: number
          value: string
        }
        Update: {
          id?: string
          label?: string
          order_id?: string
          sort_order?: number
          value?: string
        }
        Relationships: []
      }
      stitching_orders: {
        Row: {
          amount: number
          bag_no: string | null
          created_at: string
          customer_id: string
          delivery_on: string | null
          id: string
          order_no: string
          ordered_on: string
          status: string
          stitching_product_id: string | null
        }
        Insert: {
          amount?: number
          bag_no?: string | null
          created_at?: string
          customer_id: string
          delivery_on?: string | null
          id?: string
          order_no: string
          ordered_on?: string
          status?: string
          stitching_product_id?: string | null
        }
        Update: {
          amount?: number
          bag_no?: string | null
          created_at?: string
          customer_id?: string
          delivery_on?: string | null
          id?: string
          order_no?: string
          ordered_on?: string
          status?: string
          stitching_product_id?: string | null
        }
        Relationships: []
      }
      stitching_processes: {
        Row: {
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      stitching_products: {
        Row: {
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          address: string | null
          created_at: string
          department: string
          email: string
          full_name: string
          gender: string | null
          id: string
          mobile: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          department: string
          email: string
          full_name: string
          gender?: string | null
          id: string
          mobile?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          department?: string
          email?: string
          full_name?: string
          gender?: string | null
          id?: string
          mobile?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff"
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

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
    },
  },
} as const
