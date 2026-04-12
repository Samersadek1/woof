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
      booking_addons: {
        Row: {
          addon_type: Database["public"]["Enums"]["addon_type"]
          booking_id: string
          created_at: string
          description: string | null
          id: string
          notes: string | null
          quantity: number
          scheduled_date: string | null
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          addon_type: Database["public"]["Enums"]["addon_type"]
          booking_id: string
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          quantity?: number
          scheduled_date?: string | null
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          addon_type?: Database["public"]["Enums"]["addon_type"]
          booking_id?: string
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          quantity?: number
          scheduled_date?: string | null
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_items: {
        Row: {
          booking_id: string
          category: string
          condition_notes: string | null
          created_at: string
          description: string
          id: string
          photo_urls: string[]
          quantity: number
          return_notes: string | null
          return_status: string | null
          returned: boolean | null
        }
        Insert: {
          booking_id: string
          category: string
          condition_notes?: string | null
          created_at?: string
          description: string
          id?: string
          photo_urls?: string[]
          quantity?: number
          return_notes?: string | null
          return_status?: string | null
          returned?: boolean | null
        }
        Update: {
          booking_id?: string
          category?: string
          condition_notes?: string | null
          created_at?: string
          description?: string
          id?: string
          photo_urls?: string[]
          quantity?: number
          return_notes?: string | null
          return_status?: string | null
          returned?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_pets: {
        Row: {
          booking_id: string
          feeding_notes: string | null
          id: string
          medication_notes: string | null
          pet_id: string
          special_instructions: string | null
        }
        Insert: {
          booking_id: string
          feeding_notes?: string | null
          id?: string
          medication_notes?: string | null
          pet_id: string
          special_instructions?: string | null
        }
        Update: {
          booking_id?: string
          feeding_notes?: string | null
          id?: string
          medication_notes?: string | null
          pet_id?: string
          special_instructions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_pets_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_pets_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          actual_check_in_at: string | null
          actual_check_out_at: string | null
          booking_ref: string | null
          camera_link: string | null
          check_in_date: string
          check_out_date: string
          created_at: string
          do_not_move: boolean
          extended_from_booking_id: string | null
          id: string
          is_extension: boolean
          is_free_upgrade: boolean
          notes: string | null
          original_room_type: Database["public"]["Enums"]["room_type"] | null
          owner_id: string
          pickup_required: boolean
          dropoff_required: boolean
          room_id: string
          staff_id: string | null
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          upgrade_reason: string | null
          upgraded_to_room_type: Database["public"]["Enums"]["room_type"] | null
        }
        Insert: {
          actual_check_in_at?: string | null
          actual_check_out_at?: string | null
          booking_ref?: string | null
          camera_link?: string | null
          check_in_date: string
          check_out_date: string
          created_at?: string
          do_not_move?: boolean
          extended_from_booking_id?: string | null
          id?: string
          is_extension?: boolean
          is_free_upgrade?: boolean
          notes?: string | null
          original_room_type?: Database["public"]["Enums"]["room_type"] | null
          owner_id: string
          pickup_required?: boolean
          dropoff_required?: boolean
          room_id: string
          staff_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          upgrade_reason?: string | null
          upgraded_to_room_type?:
            | Database["public"]["Enums"]["room_type"]
            | null
        }
        Update: {
          actual_check_in_at?: string | null
          actual_check_out_at?: string | null
          booking_ref?: string | null
          camera_link?: string | null
          check_in_date?: string
          check_out_date?: string
          created_at?: string
          do_not_move?: boolean
          extended_from_booking_id?: string | null
          id?: string
          is_extension?: boolean
          is_free_upgrade?: boolean
          notes?: string | null
          original_room_type?: Database["public"]["Enums"]["room_type"] | null
          owner_id?: string
          pickup_required?: boolean
          dropoff_required?: boolean
          room_id?: string
          staff_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          upgrade_reason?: string | null
          upgraded_to_room_type?:
            | Database["public"]["Enums"]["room_type"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_extended_from_booking_id_fkey"
            columns: ["extended_from_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_notes: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          note_date: string
          note_text: string
          pet_id: string
          staff_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          note_date: string
          note_text: string
          pet_id: string
          staff_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          note_date?: string
          note_text?: string
          pet_id?: string
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_notes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_notes_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_notes_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      daycare_packages: {
        Row: {
          created_at: string
          days_used: number
          expiry_date: string | null
          id: string
          notes: string | null
          owner_id: string
          pet_id: string
          price_paid: number | null
          purchase_date: string
          total_days: number
        }
        Insert: {
          created_at?: string
          days_used?: number
          expiry_date?: string | null
          id?: string
          notes?: string | null
          owner_id: string
          pet_id: string
          price_paid?: number | null
          purchase_date: string
          total_days: number
        }
        Update: {
          created_at?: string
          days_used?: number
          expiry_date?: string | null
          id?: string
          notes?: string | null
          owner_id?: string
          pet_id?: string
          price_paid?: number | null
          purchase_date?: string
          total_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "daycare_packages_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_packages_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      daycare_sessions: {
        Row: {
          checked_in: boolean
          checked_in_at: string | null
          checked_out_at: string | null
          created_at: string
          id: string
          notes: string | null
          owner_id: string
          package_id: string | null
          pet_id: string
          session_date: string
          staff_id: string | null
        }
        Insert: {
          checked_in?: boolean
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          owner_id: string
          package_id?: string | null
          pet_id: string
          session_date: string
          staff_id?: string | null
        }
        Update: {
          checked_in?: boolean
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string
          package_id?: string | null
          pet_id?: string
          session_date?: string
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daycare_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_sessions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "daycare_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_sessions_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daycare_sessions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      feeding_logs: {
        Row: {
          created_at: string
          fed_at: string | null
          fed_by: string | null
          feeding_schedule_id: string
          id: string
          log_date: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          fed_at?: string | null
          fed_by?: string | null
          feeding_schedule_id: string
          id?: string
          log_date: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          fed_at?: string | null
          fed_by?: string | null
          feeding_schedule_id?: string
          id?: string
          log_date?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feeding_logs_fed_by_fkey"
            columns: ["fed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feeding_logs_feeding_schedule_id_fkey"
            columns: ["feeding_schedule_id"]
            isOneToOne: false
            referencedRelation: "feeding_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      feeding_schedules: {
        Row: {
          amount: string | null
          booking_id: string
          created_at: string
          food_type: string | null
          id: string
          meal_label: string
          meal_time: string | null
          pet_id: string
          special_instructions: string | null
        }
        Insert: {
          amount?: string | null
          booking_id: string
          created_at?: string
          food_type?: string | null
          id?: string
          meal_label: string
          meal_time?: string | null
          pet_id: string
          special_instructions?: string | null
        }
        Update: {
          amount?: string | null
          booking_id?: string
          created_at?: string
          food_type?: string | null
          id?: string
          meal_label?: string
          meal_time?: string | null
          pet_id?: string
          special_instructions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feeding_schedules_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feeding_schedules_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      grooming_appointments: {
        Row: {
          appointment_date: string
          appointment_time: string | null
          booking_id: string | null
          completed_at: string | null
          created_at: string
          duration_minutes: number | null
          groomer_id: string | null
          groomer_name: string | null
          id: string
          in_progress_at: string | null
          no_show: boolean
          notes: string | null
          owner_id: string
          pet_id: string
          price: number | null
          reminder_sent: boolean
          service: Database["public"]["Enums"]["grooming_service"]
          status: string
        }
        Insert: {
          appointment_date: string
          appointment_time?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          groomer_id?: string | null
          groomer_name?: string | null
          id?: string
          in_progress_at?: string | null
          no_show?: boolean
          notes?: string | null
          owner_id: string
          pet_id: string
          price?: number | null
          reminder_sent?: boolean
          service: Database["public"]["Enums"]["grooming_service"]
          status?: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          groomer_id?: string | null
          groomer_name?: string | null
          id?: string
          in_progress_at?: string | null
          no_show?: boolean
          notes?: string | null
          owner_id?: string
          pet_id?: string
          price?: number | null
          reminder_sent?: boolean
          service?: Database["public"]["Enums"]["grooming_service"]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "grooming_appointments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grooming_appointments_groomer_id_fkey"
            columns: ["groomer_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grooming_appointments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grooming_appointments_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_logs: {
        Row: {
          created_at: string
          handover_time: string
          id: string
          notes: string
          shift_date: string
          staff_id: string | null
        }
        Insert: {
          created_at?: string
          handover_time: string
          id?: string
          notes: string
          shift_date: string
          staff_id?: string | null
        }
        Update: {
          created_at?: string
          handover_time?: string
          id?: string
          notes?: string
          shift_date?: string
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handover_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          service_type: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          service_type?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          service_type?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          booking_id: string | null
          created_at: string
          discount_amount: number
          discount_pct: number
          due_date: string | null
          id: string
          invoice_number: string | null
          issue_date: string
          notes: string | null
          owner_id: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          booking_id?: string | null
          created_at?: string
          discount_amount?: number
          discount_pct?: number
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string
          notes?: string | null
          owner_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          booking_id?: string | null
          created_at?: string
          discount_amount?: number
          discount_pct?: number
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string
          notes?: string | null
          owner_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_logs: {
        Row: {
          created_at: string
          given_at: string | null
          given_by: string | null
          id: string
          log_date: string
          medication_id: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          given_at?: string | null
          given_by?: string | null
          id?: string
          log_date: string
          medication_id: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          given_at?: string | null
          given_by?: string | null
          id?: string
          log_date?: string
          medication_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_logs_given_by_fkey"
            columns: ["given_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_logs_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "stay_medications"
            referencedColumns: ["id"]
          },
        ]
      }
      owners: {
        Row: {
          address: string | null
          always_same_room: boolean
          camera_required: boolean
          created_at: string
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emirates_id: string | null
          first_name: string
          how_heard: string | null
          id: string
          is_msh_owned: boolean
          is_vip: boolean
          last_name: string
          member_type: Database["public"]["Enums"]["member_type"]
          membership_date: string | null
          membership_fee_paid: boolean
          notes: string | null
          other_notes: string | null
          phone: string
          updated_at: string
          vet_name: string | null
          vet_phone: string | null
          wallet_balance: number
        }
        Insert: {
          address?: string | null
          always_same_room?: boolean
          camera_required?: boolean
          created_at?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emirates_id?: string | null
          first_name: string
          how_heard?: string | null
          id?: string
          is_msh_owned?: boolean
          is_vip?: boolean
          last_name: string
          member_type?: Database["public"]["Enums"]["member_type"]
          membership_date?: string | null
          membership_fee_paid?: boolean
          notes?: string | null
          other_notes?: string | null
          phone: string
          updated_at?: string
          vet_name?: string | null
          vet_phone?: string | null
          wallet_balance?: number
        }
        Update: {
          address?: string | null
          always_same_room?: boolean
          camera_required?: boolean
          created_at?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emirates_id?: string | null
          first_name?: string
          how_heard?: string | null
          id?: string
          is_msh_owned?: boolean
          is_vip?: boolean
          last_name?: string
          member_type?: Database["public"]["Enums"]["member_type"]
          membership_date?: string | null
          membership_fee_paid?: boolean
          notes?: string | null
          other_notes?: string | null
          phone?: string
          updated_at?: string
          vet_name?: string | null
          vet_phone?: string | null
          wallet_balance?: number
        }
        Relationships: []
      }
      park_bookings: {
        Row: {
          created_at: string
          id: string
          is_assessment: boolean
          notes: string | null
          owner_id: string | null
          owner_name_raw: string | null
          pet_id: string | null
          pet_name_raw: string | null
          price: number | null
          size_lane: Database["public"]["Enums"]["park_size"]
          slot_end: string
          slot_start: string
          staff_id: string | null
          visit_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_assessment?: boolean
          notes?: string | null
          owner_id?: string | null
          owner_name_raw?: string | null
          pet_id?: string | null
          pet_name_raw?: string | null
          price?: number | null
          size_lane: Database["public"]["Enums"]["park_size"]
          slot_end: string
          slot_start: string
          staff_id?: string | null
          visit_date: string
        }
        Update: {
          created_at?: string
          id?: string
          is_assessment?: boolean
          notes?: string | null
          owner_id?: string | null
          owner_name_raw?: string | null
          pet_id?: string | null
          pet_name_raw?: string | null
          price?: number | null
          size_lane?: Database["public"]["Enums"]["park_size"]
          slot_end?: string
          slot_start?: string
          staff_id?: string | null
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "park_bookings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_bookings_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "park_bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      park_day_flags: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["park_day_status"]
          visit_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["park_day_status"]
          visit_date: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["park_day_status"]
          visit_date?: string
        }
        Relationships: []
      }
      pets: {
        Row: {
          active: boolean
          assessment_status: Database["public"]["Enums"]["assessment_status"]
          behavioural_notes: string | null
          breed: string | null
          camera_preferred: boolean
          colour: string | null
          created_at: string
          date_of_birth: string | null
          feeding_instructions: string | null
          gender: Database["public"]["Enums"]["pet_gender"] | null
          grooming_notes: string | null
          id: string
          medical_conditions: string | null
          medications: string | null
          microchip_number: string | null
          name: string
          other_notes: string | null
          owner_id: string
          photo_url: string | null
          spayed_neutered: boolean | null
          species: Database["public"]["Enums"]["species"]
          updated_at: string
          vaccicheck_distemper_tier: string | null
          vaccicheck_hepatitis_tier: string | null
          vaccicheck_immunity_rating: string | null
          vaccicheck_parvovirus_tier: string | null
          vaccicheck_report_url: string | null
          vaccicheck_test_date: string | null
          vet_name: string | null
          vet_phone: string | null
          weight_kg: number | null
        }
        Insert: {
          active?: boolean
          assessment_status?: Database["public"]["Enums"]["assessment_status"]
          behavioural_notes?: string | null
          breed?: string | null
          camera_preferred?: boolean
          colour?: string | null
          created_at?: string
          date_of_birth?: string | null
          feeding_instructions?: string | null
          gender?: Database["public"]["Enums"]["pet_gender"] | null
          grooming_notes?: string | null
          id?: string
          medical_conditions?: string | null
          medications?: string | null
          microchip_number?: string | null
          name: string
          other_notes?: string | null
          owner_id: string
          photo_url?: string | null
          spayed_neutered?: boolean | null
          species?: Database["public"]["Enums"]["species"]
          updated_at?: string
          vaccicheck_distemper_tier?: string | null
          vaccicheck_hepatitis_tier?: string | null
          vaccicheck_immunity_rating?: string | null
          vaccicheck_parvovirus_tier?: string | null
          vaccicheck_report_url?: string | null
          vaccicheck_test_date?: string | null
          vet_name?: string | null
          vet_phone?: string | null
          weight_kg?: number | null
        }
        Update: {
          active?: boolean
          assessment_status?: Database["public"]["Enums"]["assessment_status"]
          behavioural_notes?: string | null
          breed?: string | null
          camera_preferred?: boolean
          colour?: string | null
          created_at?: string
          date_of_birth?: string | null
          feeding_instructions?: string | null
          gender?: Database["public"]["Enums"]["pet_gender"] | null
          grooming_notes?: string | null
          id?: string
          medical_conditions?: string | null
          medications?: string | null
          microchip_number?: string | null
          name?: string
          other_notes?: string | null
          owner_id?: string
          photo_url?: string | null
          spayed_neutered?: boolean | null
          species?: Database["public"]["Enums"]["species"]
          updated_at?: string
          vaccicheck_distemper_tier?: string | null
          vaccicheck_hepatitis_tier?: string | null
          vaccicheck_immunity_rating?: string | null
          vaccicheck_parvovirus_tier?: string | null
          vaccicheck_report_url?: string | null
          vaccicheck_test_date?: string | null
          vet_name?: string | null
          vet_phone?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          cam_host: string | null
          cam_id: string | null
          cam_number: string | null
          cam_password: string | null
          cam_username: string | null
          capacity_type: Database["public"]["Enums"]["capacity_type"]
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          max_pets: number
          nightly_rate: number | null
          notes: string | null
          room_number: string
          room_type: Database["public"]["Enums"]["room_type"]
          street_name: string | null
          wing: Database["public"]["Enums"]["room_wing"]
        }
        Insert: {
          cam_host?: string | null
          cam_id?: string | null
          cam_number?: string | null
          cam_password?: string | null
          cam_username?: string | null
          capacity_type?: Database["public"]["Enums"]["capacity_type"]
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          max_pets?: number
          nightly_rate?: number | null
          notes?: string | null
          room_number: string
          room_type: Database["public"]["Enums"]["room_type"]
          street_name?: string | null
          wing: Database["public"]["Enums"]["room_wing"]
        }
        Update: {
          cam_host?: string | null
          cam_id?: string | null
          cam_number?: string | null
          cam_password?: string | null
          cam_username?: string | null
          capacity_type?: Database["public"]["Enums"]["capacity_type"]
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          max_pets?: number
          nightly_rate?: number | null
          notes?: string | null
          room_number?: string
          room_type?: Database["public"]["Enums"]["room_type"]
          street_name?: string | null
          wing?: Database["public"]["Enums"]["room_wing"]
        }
        Relationships: []
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          role: Database["public"]["Enums"]["staff_role"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          role: Database["public"]["Enums"]["staff_role"]
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Relationships: []
      }
      stay_medications: {
        Row: {
          booking_id: string
          created_at: string
          dosage: string | null
          frequency: string | null
          id: string
          medication_name: string
          notes: string | null
          pet_id: string
          timing: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          dosage?: string | null
          frequency?: string | null
          id?: string
          medication_name: string
          notes?: string | null
          pet_id: string
          timing?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          dosage?: string | null
          frequency?: string | null
          id?: string
          medication_name?: string
          notes?: string | null
          pet_id?: string
          timing?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stay_medications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stay_medications_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccinations: {
        Row: {
          administered_date: string | null
          created_at: string
          document_url: string | null
          expiry_date: string
          id: string
          pet_id: string
          updated_at: string
          vaccine_name: string
        }
        Insert: {
          administered_date?: string | null
          created_at?: string
          document_url?: string | null
          expiry_date: string
          id?: string
          pet_id: string
          updated_at?: string
          vaccine_name: string
        }
        Update: {
          administered_date?: string | null
          created_at?: string
          document_url?: string | null
          expiry_date?: string
          id?: string
          pet_id?: string
          updated_at?: string
          vaccine_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaccinations_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      waiting_list: {
        Row: {
          created_at: string
          has_wallet_balance: boolean
          id: string
          notes: string | null
          owner_id: string | null
          owner_name_raw: string | null
          pet_id: string | null
          pet_name_raw: string | null
          requested_check_in: string
          requested_check_out: string
          room_type_requested: Database["public"]["Enums"]["room_type"] | null
          status: string
          transport_needed: boolean
        }
        Insert: {
          created_at?: string
          has_wallet_balance?: boolean
          id?: string
          notes?: string | null
          owner_id?: string | null
          owner_name_raw?: string | null
          pet_id?: string | null
          pet_name_raw?: string | null
          requested_check_in: string
          requested_check_out: string
          room_type_requested?: Database["public"]["Enums"]["room_type"] | null
          status?: string
          transport_needed?: boolean
        }
        Update: {
          created_at?: string
          has_wallet_balance?: boolean
          id?: string
          notes?: string | null
          owner_id?: string | null
          owner_name_raw?: string | null
          pet_id?: string | null
          pet_name_raw?: string | null
          requested_check_in?: string
          requested_check_out?: string
          room_type_requested?: Database["public"]["Enums"]["room_type"] | null
          status?: string
          transport_needed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "waiting_list_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_list_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          notes: string | null
          owner_id: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          reference_id: string | null
          reference_type: string | null
          staff_id: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          notes?: string | null
          owner_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          reference_id?: string | null
          reference_type?: string | null
          staff_id?: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          reference_id?: string | null
          reference_type?: string | null
          staff_id?: string | null
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_topup_requests: {
        Row: {
          id: string
          owner_id: string
          amount_requested: number
          status: string
          requested_by: string
          requested_at: string
          received_at: string | null
          reminder_sent_at: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          amount_requested: number
          status?: string
          requested_by?: string
          requested_at?: string
          received_at?: string | null
          reminder_sent_at?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          amount_requested?: number
          status?: string
          requested_by?: string
          requested_at?: string
          received_at?: string | null
          reminder_sent_at?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_topup_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      addon_type:
        | "transport_dubai"
        | "transport_abudhabi"
        | "grooming_full"
        | "grooming_bath"
        | "grooming_nail"
        | "grooming_deshedding"
        | "grooming_brushing"
        | "other"
      assessment_status: "not_assessed" | "passed" | "failed"
      booking_status:
        | "enquiry"
        | "confirmed"
        | "checked_in"
        | "checked_out"
        | "cancelled"
        | "no_show"
      capacity_type: "single" | "twin" | "twin_plus" | "multiple"
      grooming_service:
        | "full_groom"
        | "full_bath"
        | "nail_clip"
        | "deshedding"
        | "brushing"
        | "pawdicure"
      invoice_status:
        | "draft"
        | "issued"
        | "paid"
        | "partially_paid"
        | "cancelled"
      member_type: "standard" | "silver" | "gold"
      park_day_status: "open" | "closed" | "assessment_only"
      park_size: "small" | "big"
      payment_method: "wallet" | "card" | "cash"
      pet_gender: "male" | "female"
      room_type:
        | "presidential_super"
        | "presidential_standard"
        | "royal_suite_double"
        | "royal_suite_single"
        | "double_royal"
        | "single_royal"
        | "family_room"
        | "royal_annex"
        | "cattery_super_presidential"
        | "cattery_presidential"
        | "cattery_deluxe"
      room_wing:
        | "oxford"
        | "piccadilly"
        | "park_lane"
        | "fleet"
        | "back_kennels"
        | "cattery"
        | "grooming_upstairs"
      species: "dog" | "cat" | "other"
      staff_role:
        | "booking_coordinator"
        | "management"
        | "groomer"
        | "kennel_staff"
        | "night_staff"
        | "admin"
      transaction_type:
        | "top_up"
        | "deduction"
        | "refund"
        | "membership_fee"
        | "adjustment"
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
    Enums: {
      addon_type: [
        "transport_dubai",
        "transport_abudhabi",
        "grooming_full",
        "grooming_bath",
        "grooming_nail",
        "grooming_deshedding",
        "grooming_brushing",
        "other",
      ],
      assessment_status: ["not_assessed", "passed", "failed"],
      booking_status: [
        "enquiry",
        "confirmed",
        "checked_in",
        "checked_out",
        "cancelled",
        "no_show",
      ],
      capacity_type: ["single", "twin", "twin_plus", "multiple"],
      grooming_service: [
        "full_groom",
        "full_bath",
        "nail_clip",
        "deshedding",
        "brushing",
        "pawdicure",
      ],
      invoice_status: [
        "draft",
        "issued",
        "paid",
        "partially_paid",
        "cancelled",
      ],
      member_type: ["standard", "silver", "gold"],
      park_day_status: ["open", "closed", "assessment_only"],
      park_size: ["small", "big"],
      payment_method: ["wallet", "card", "cash"],
      pet_gender: ["male", "female"],
      room_type: [
        "presidential_super",
        "presidential_standard",
        "royal_suite_double",
        "royal_suite_single",
        "double_royal",
        "single_royal",
        "family_room",
        "royal_annex",
        "cattery_super_presidential",
        "cattery_presidential",
        "cattery_deluxe",
      ],
      room_wing: [
        "oxford",
        "piccadilly",
        "park_lane",
        "fleet",
        "back_kennels",
        "cattery",
        "grooming_upstairs",
      ],
      species: ["dog", "cat", "other"],
      staff_role: [
        "booking_coordinator",
        "management",
        "groomer",
        "kennel_staff",
        "night_staff",
        "admin",
      ],
      transaction_type: [
        "top_up",
        "deduction",
        "refund",
        "membership_fee",
        "adjustment",
      ],
    },
  },
} as const
