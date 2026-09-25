export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          attachments: Json
          booking_reference: string | null
          category: string
          checklist: Json
          created_at: string
          created_by: string
          day_date: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          end_time: string | null
          estimated_cost: number | null
          flexible_period: string | null
          formatted_address: string | null
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          participants: Json
          place_id: string | null
          place_name: string | null
          poll_options: Json
          poll_status: string
          poll_votes: Json
          position: number
          restored_at: string | null
          restored_by: string | null
          start_time: string | null
          timing_specificity: string
          title: string
          trip_id: string
          updated_at: string
          updated_by: string
          version: number
          voting_ends_at: string | null
        }
        Insert: {
          attachments?: Json
          booking_reference?: string | null
          category?: string
          checklist?: Json
          created_at?: string
          created_by?: string
          day_date: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          end_time?: string | null
          estimated_cost?: number | null
          flexible_period?: string | null
          formatted_address?: string | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          participants?: Json
          place_id?: string | null
          place_name?: string | null
          poll_options?: Json
          poll_status?: string
          poll_votes?: Json
          position?: number
          restored_at?: string | null
          restored_by?: string | null
          start_time?: string | null
          timing_specificity?: string
          title: string
          trip_id: string
          updated_at?: string
          updated_by: string
          version?: number
          voting_ends_at?: string | null
        }
        Update: {
          attachments?: Json
          booking_reference?: string | null
          category?: string
          checklist?: Json
          created_at?: string
          created_by?: string
          day_date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          end_time?: string | null
          estimated_cost?: number | null
          flexible_period?: string | null
          formatted_address?: string | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          participants?: Json
          place_id?: string | null
          place_name?: string | null
          poll_options?: Json
          poll_status?: string
          poll_votes?: Json
          position?: number
          restored_at?: string | null
          restored_by?: string | null
          start_time?: string | null
          timing_specificity?: string
          title?: string
          trip_id?: string
          updated_at?: string
          updated_by?: string
          version?: number
          voting_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_personal_budgets: {
        Row: {
          activity_id: string
          amount: number
          created_at: string
          currency: string
          id: string
          trip_id: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          activity_id: string
          amount: number
          created_at?: string
          currency: string
          id?: string
          trip_id: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          activity_id?: string
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          trip_id?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_personal_budgets_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_personal_budgets_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_personal_budgets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_personal_budgets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          blocked_at: string | null
          blocked_by: string | null
          created_at: string
          id: string
          recipient_id: string
          recipient_snapshot: Json
          requester_id: string
          requester_snapshot: Json
          source: string
          status: Database["public"]["Enums"]["connection_status"]
          status_changed_at: string
          status_changed_by: string
          updated_at: string
          version: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          id?: string
          recipient_id: string
          recipient_snapshot?: Json
          requester_id: string
          requester_snapshot?: Json
          source?: string
          status?: Database["public"]["Enums"]["connection_status"]
          status_changed_at: string
          status_changed_by: string
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          id?: string
          recipient_id?: string
          recipient_snapshot?: Json
          requester_id?: string
          requester_snapshot?: Json
          source?: string
          status?: Database["public"]["Enums"]["connection_status"]
          status_changed_at?: string
          status_changed_by?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "connections_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          allergies: string[]
          avatar_seed: string | null
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          dietary_restrictions: string[]
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          full_name: string
          id: string
          linked_avatar_url: string | null
          linked_handle: string | null
          linked_profile_id: string | null
          notes: string | null
          owner_id: string
          passport_expires_on: string | null
          passport_issuing_country: string | null
          phone: string | null
          preferred_currency: string | null
          preferred_language: string | null
          relationship: Database["public"]["Enums"]["contact_relationship"]
          restored_at: string | null
          restored_by: string | null
          traveler_type: Database["public"]["Enums"]["traveler_type"]
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          allergies?: string[]
          avatar_seed?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          dietary_restrictions?: string[]
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          full_name: string
          id?: string
          linked_avatar_url?: string | null
          linked_handle?: string | null
          linked_profile_id?: string | null
          notes?: string | null
          owner_id: string
          passport_expires_on?: string | null
          passport_issuing_country?: string | null
          phone?: string | null
          preferred_currency?: string | null
          preferred_language?: string | null
          relationship?: Database["public"]["Enums"]["contact_relationship"]
          restored_at?: string | null
          restored_by?: string | null
          traveler_type?: Database["public"]["Enums"]["traveler_type"]
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          allergies?: string[]
          avatar_seed?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          dietary_restrictions?: string[]
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          full_name?: string
          id?: string
          linked_avatar_url?: string | null
          linked_handle?: string | null
          linked_profile_id?: string | null
          notes?: string | null
          owner_id?: string
          passport_expires_on?: string | null
          passport_issuing_country?: string | null
          phone?: string | null
          preferred_currency?: string | null
          preferred_language?: string | null
          relationship?: Database["public"]["Enums"]["contact_relationship"]
          restored_at?: string | null
          restored_by?: string | null
          traveler_type?: Database["public"]["Enums"]["traveler_type"]
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contacts_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_linked_profile_id_fkey"
            columns: ["linked_profile_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_linked_profile_id_fkey"
            columns: ["linked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_budget_overrides: {
        Row: {
          created_at: string
          custom_budget_amount: number
          date: string
          id: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_budget_amount: number
          date: string
          id?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_budget_amount?: number
          date?: string
          id?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_budget_overrides_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_options: {
        Row: {
          created_at: string
          created_by: string
          decision_id: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          label: string
          metadata: Json
          position: number
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          decision_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          label: string
          metadata?: Json
          position: number
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          decision_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          label?: string
          metadata?: Json
          position?: number
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "decision_options_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_options_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_options_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_options_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_options_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_options_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_options_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_votes: {
        Row: {
          created_at: string
          created_by: string
          decision_id: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          option_id: string
          updated_at: string
          updated_by: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          decision_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          option_id: string
          updated_at?: string
          updated_by: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          decision_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          option_id?: string
          updated_at?: string
          updated_by?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "decision_votes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_votes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_votes_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_votes_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_votes_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "decision_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_votes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_votes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          question: string
          resolution: Json | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          trip_id: string
          type: string
          updated_at: string
          updated_by: string
          version: number
          voting_ends_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          question: string
          resolution?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          trip_id: string
          type: string
          updated_at?: string
          updated_by: string
          version?: number
          voting_ends_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          question?: string
          resolution?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          trip_id?: string
          type?: string
          updated_at?: string
          updated_by?: string
          version?: number
          voting_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_settlements: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          currency: string
          date: string
          deleted_at: string | null
          deleted_by: string | null
          from_user_id: string
          id: string
          restored_at: string | null
          restored_by: string | null
          to_user_id: string
          trip_id: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string
          currency: string
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          from_user_id: string
          id?: string
          restored_at?: string | null
          restored_by?: string | null
          to_user_id: string
          trip_id: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          currency?: string
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          from_user_id?: string
          id?: string
          restored_at?: string | null
          restored_by?: string | null
          to_user_id?: string
          trip_id?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_shares: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          expense_id: string
          id: string
          restored_at: string | null
          restored_by: string | null
          share_amount: number
          share_percentage: number | null
          split_type: Database["public"]["Enums"]["expense_split_type"]
          traveler_id: string | null
          updated_at: string
          updated_by: string
          user_id: string | null
          version: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          expense_id: string
          id?: string
          restored_at?: string | null
          restored_by?: string | null
          share_amount: number
          share_percentage?: number | null
          split_type?: Database["public"]["Enums"]["expense_split_type"]
          traveler_id?: string | null
          updated_at?: string
          updated_by: string
          user_id?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          expense_id?: string
          id?: string
          restored_at?: string | null
          restored_by?: string | null
          share_amount?: number
          share_percentage?: number | null
          split_type?: Database["public"]["Enums"]["expense_split_type"]
          traveler_id?: string | null
          updated_at?: string
          updated_by?: string
          user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_shares_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_traveler_id_fkey"
            columns: ["traveler_id"]
            isOneToOne: false
            referencedRelation: "trip_travelers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          activity_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          description: string
          exchange_rate_to_base: number | null
          expense_date: string
          id: string
          paid_by: string | null
          paid_by_traveler_id: string | null
          restored_at: string | null
          restored_by: string | null
          split_type: Database["public"]["Enums"]["expense_split_type"]
          trip_id: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          activity_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          exchange_rate_to_base?: number | null
          expense_date?: string
          id?: string
          paid_by?: string | null
          paid_by_traveler_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          split_type?: Database["public"]["Enums"]["expense_split_type"]
          trip_id: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          activity_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          exchange_rate_to_base?: number | null
          expense_date?: string
          id?: string
          paid_by?: string | null
          paid_by_traveler_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          split_type?: Database["public"]["Enums"]["expense_split_type"]
          trip_id?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "expenses_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_traveler_id_fkey"
            columns: ["paid_by_traveler_id"]
            isOneToOne: false
            referencedRelation: "trip_travelers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          push_sent_at: string | null
          reference_id: string
          type: Database["public"]["Enums"]["notification_type"]
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          push_sent_at?: string | null
          reference_id: string
          type: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          push_sent_at?: string | null
          reference_id?: string
          type?: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_directory: {
        Row: {
          avatar_seed: string | null
          avatar_url: string | null
          created_at: string
          display_name: string
          preferred_currency: string
          preferred_language: string
          profile_id: string
          public_handle: string | null
          updated_at: string
          viatik_id: string
        }
        Insert: {
          avatar_seed?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name: string
          preferred_currency?: string
          preferred_language?: string
          profile_id: string
          public_handle?: string | null
          updated_at?: string
          viatik_id: string
        }
        Update: {
          avatar_seed?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          preferred_currency?: string
          preferred_language?: string
          profile_id?: string
          public_handle?: string | null
          updated_at?: string
          viatik_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_directory_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_directory_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_lookup_attempts: {
        Row: {
          attempts: number
          user_id: string
          window_start: string
        }
        Insert: {
          attempts?: number
          user_id: string
          window_start?: string
        }
        Update: {
          attempts?: number
          user_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_lookup_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_lookup_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allergies: string[]
          avatar_seed: string | null
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          dietary_restrictions: string[]
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          full_name: string | null
          id: string
          mute_trip_notifications: boolean
          passport_expires_on: string | null
          passport_issuing_country: string | null
          phone: string | null
          preferred_currency: string
          preferred_language: string
          public_handle: string | null
          updated_at: string
          viatik_id: string
        }
        Insert: {
          allergies?: string[]
          avatar_seed?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          dietary_restrictions?: string[]
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          full_name?: string | null
          id: string
          mute_trip_notifications?: boolean
          passport_expires_on?: string | null
          passport_issuing_country?: string | null
          phone?: string | null
          preferred_currency?: string
          preferred_language?: string
          public_handle?: string | null
          updated_at?: string
          viatik_id?: string
        }
        Update: {
          allergies?: string[]
          avatar_seed?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          dietary_restrictions?: string[]
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          full_name?: string | null
          id?: string
          mute_trip_notifications?: boolean
          passport_expires_on?: string | null
          passport_issuing_country?: string | null
          phone?: string | null
          preferred_currency?: string
          preferred_language?: string
          public_handle?: string | null
          updated_at?: string
          viatik_id?: string
        }
        Relationships: []
      }
      trip_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          invited_user_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["trip_member_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          status_changed_at: string
          status_changed_by: string
          trip_id: string
          updated_at: string
          version: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_user_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["trip_member_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          status_changed_at: string
          status_changed_by: string
          trip_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_user_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["trip_member_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          status_changed_at?: string
          status_changed_by?: string
          trip_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitations_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitations_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitations_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitations_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitations_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitations_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_media: {
        Row: {
          activity_id: string | null
          byte_size: number
          caption: string | null
          content_type: string
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          restored_at: string | null
          restored_by: string | null
          storage_path: string
          trip_id: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          activity_id?: string | null
          byte_size?: number
          caption?: string | null
          content_type?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          restored_at?: string | null
          restored_by?: string | null
          storage_path: string
          trip_id: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          activity_id?: string | null
          byte_size?: number
          caption?: string | null
          content_type?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          restored_at?: string | null
          restored_by?: string | null
          storage_path?: string
          trip_id?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_media_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_media_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_media_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_media_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_media_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_media_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_media_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_media_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_media_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_media_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          invited_by: string | null
          joined_at: string
          removed_at: string | null
          removed_by: string | null
          role: Database["public"]["Enums"]["trip_member_role"]
          role_changed_at: string | null
          role_changed_by: string | null
          trip_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          removed_at?: string | null
          removed_by?: string | null
          role?: Database["public"]["Enums"]["trip_member_role"]
          role_changed_at?: string | null
          role_changed_by?: string | null
          trip_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          removed_at?: string | null
          removed_by?: string | null
          role?: Database["public"]["Enums"]["trip_member_role"]
          role_changed_at?: string | null
          role_changed_by?: string | null
          trip_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_share_links: {
        Row: {
          active: boolean
          allow_gallery: boolean
          allow_itinerary: boolean
          allow_map: boolean
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          disabled_at: string | null
          disabled_by: string | null
          enabled_at: string | null
          enabled_by: string | null
          id: string
          label: string | null
          restored_at: string | null
          restored_by: string | null
          slug: string
          trip_id: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          active?: boolean
          allow_gallery?: boolean
          allow_itinerary?: boolean
          allow_map?: boolean
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          enabled_at?: string | null
          enabled_by?: string | null
          id?: string
          label?: string | null
          restored_at?: string | null
          restored_by?: string | null
          slug: string
          trip_id: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          active?: boolean
          allow_gallery?: boolean
          allow_itinerary?: boolean
          allow_map?: boolean
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          enabled_at?: string | null
          enabled_by?: string | null
          id?: string
          label?: string | null
          restored_at?: string | null
          restored_by?: string | null
          slug?: string
          trip_id?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_disabled_by_fkey"
            columns: ["disabled_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_disabled_by_fkey"
            columns: ["disabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_travelers: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          display_name: string
          id: string
          restored_at: string | null
          restored_by: string | null
          traveler_type: Database["public"]["Enums"]["traveler_type"]
          trip_id: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          display_name: string
          id?: string
          restored_at?: string | null
          restored_by?: string | null
          traveler_type?: Database["public"]["Enums"]["traveler_type"]
          trip_id: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          display_name?: string
          id?: string
          restored_at?: string | null
          restored_by?: string | null
          traveler_type?: Database["public"]["Enums"]["traveler_type"]
          trip_id?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_travelers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_travelers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_travelers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_travelers_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_travelers_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_travelers_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_travelers_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_travelers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_travelers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_travelers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_weather_forecasts: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          fetched_at: string
          forecast_json: Json
          id: string
          location_revision: string
          trip_id: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          fetched_at: string
          forecast_json?: Json
          id?: string
          location_revision: string
          trip_id: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          fetched_at?: string
          forecast_json?: Json
          id?: string
          location_revision?: string
          trip_id?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_weather_forecasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_weather_forecasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_weather_forecasts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_weather_forecasts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_weather_forecasts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          adult_count: number
          base_currency: string
          child_count: number
          completed_at: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          destination: string | null
          end_date: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          owner_id: string
          place_id: string | null
          restored_at: string | null
          restored_by: string | null
          start_date: string | null
          started_at: string | null
          status: string
          status_changed_at: string | null
          status_changed_by: string | null
          time_zone: string | null
          total_budget: number | null
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          adult_count?: number
          base_currency?: string
          child_count?: number
          completed_at?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          destination?: string | null
          end_date?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          owner_id: string
          place_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          start_date?: string | null
          started_at?: string | null
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          time_zone?: string | null
          total_budget?: number | null
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          adult_count?: number
          base_currency?: string
          child_count?: number
          completed_at?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          destination?: string | null
          end_date?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          owner_id?: string
          place_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          start_date?: string | null
          started_at?: string | null
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          time_zone?: string | null
          total_budget?: number | null
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_wallets: {
        Row: {
          created_at: string
          currency: string
          id: string
          starting_balance: number
          trip_id: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          starting_balance?: number
          trip_id: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          starting_balance?: number
          trip_id?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_wallets_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_entries: {
        Row: {
          ciphertext: string
          created_at: string
          deleted_at: string | null
          id: string
          initialization_vector: string
          key_version: number
          owner_id: string
          restored_at: string | null
          restored_by: string | null
          trip_id: string
          updated_at: string
          version: number
        }
        Insert: {
          ciphertext: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          initialization_vector: string
          key_version?: number
          owner_id: string
          restored_at?: string | null
          restored_by?: string | null
          trip_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          ciphertext?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          initialization_vector?: string
          key_version?: number
          owner_id?: string
          restored_at?: string | null
          restored_by?: string | null
          trip_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "vault_entries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_entries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_keysets: {
        Row: {
          created_at: string
          id: string
          iterations: number
          kdf: string
          key_version: number
          owner_id: string
          salt: string
          updated_at: string
          verification_ciphertext: string
          verification_iv: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          iterations: number
          kdf?: string
          key_version?: number
          owner_id: string
          salt: string
          updated_at?: string
          verification_ciphertext: string
          verification_iv: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          iterations?: number
          kdf?: string
          key_version?: number
          owner_id?: string
          salt?: string
          updated_at?: string
          verification_ciphertext?: string
          verification_iv?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "vault_keysets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_keysets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_credentials: {
        Row: {
          backed_up: boolean
          counter: number
          created_at: string
          credential_id: string
          device_type: string | null
          id: string
          public_key: string
          transports: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          backed_up?: boolean
          counter?: number
          created_at?: string
          credential_id: string
          device_type?: string | null
          id?: string
          public_key: string
          transports?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          backed_up?: boolean
          counter?: number
          created_at?: string
          credential_id?: string
          device_type?: string | null
          id?: string
          public_key?: string
          transports?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webauthn_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_public_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webauthn_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profile_public_data: {
        Row: {
          avatar_seed: string | null
          avatar_url: string | null
          full_name: string | null
          id: string | null
          preferred_currency: string | null
          preferred_language: string | null
          public_handle: string | null
        }
        Insert: {
          avatar_seed?: string | null
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          preferred_currency?: string | null
          preferred_language?: string | null
          public_handle?: string | null
        }
        Update: {
          avatar_seed?: string | null
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          preferred_currency?: string | null
          preferred_language?: string | null
          public_handle?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_connection_from_qr: {
        Args: { p_recipient_id: string }
        Returns: Json
      }
      accept_trip_invitation: {
        Args: { p_invitation_id: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          invited_by: string | null
          joined_at: string
          removed_at: string | null
          removed_by: string | null
          role: Database["public"]["Enums"]["trip_member_role"]
          role_changed_at: string | null
          role_changed_by: string | null
          trip_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "trip_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      connection_snapshot_contains_private: {
        Args: { p_snapshot: Json }
        Returns: boolean
      }
      get_profile_public_data: {
        Args: { p_ids: string[] }
        Returns: {
          avatar_seed: string
          avatar_url: string
          full_name: string
          id: string
          preferred_currency: string
          preferred_language: string
          public_handle: string
        }[]
      }
      is_active_trip_member: {
        Args: { p_trip_id: string; p_user_id: string }
        Returns: boolean
      }
      is_trip_creator: { Args: { p_trip_id: string }; Returns: boolean }
      is_trip_editor: { Args: { p_trip_id: string }; Returns: boolean }
      is_trip_member: { Args: { p_trip_id: string }; Returns: boolean }
      is_trip_owner: { Args: { p_trip_id: string }; Returns: boolean }
      lookup_profile_for_linking: {
        Args: { p_identifier: string }
        Returns: {
          avatar_seed: string
          avatar_url: string
          display_name: string
          preferred_currency: string
          preferred_language: string
          profile_id: string
          public_handle: string
          viatik_id: string
        }[]
      }
      reject_trip_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      sync_activity_cas_upsert: {
        Args: { p_base_updated_at?: string; p_payload: Json }
        Returns: Json
      }
      sync_activity_personal_budget_cas_delete: {
        Args: { p_base_updated_at: string; p_id: string }
        Returns: Json
      }
      sync_activity_personal_budget_cas_upsert: {
        Args: { p_base_updated_at?: string; p_payload: Json }
        Returns: Json
      }
      sync_cas_delete: {
        Args: { p_base_updated_at: string; p_entity: string; p_id: string }
        Returns: Json
      }
      sync_cas_upsert: {
        Args: { p_base_updated_at?: string; p_entity: string; p_payload: Json }
        Returns: Json
      }
      sync_connection_cas_upsert: {
        Args: { p_base_updated_at?: string; p_payload: Json }
        Returns: Json
      }
      sync_contact_cas_upsert: {
        Args: { p_base_updated_at?: string; p_payload: Json }
        Returns: Json
      }
      sync_trip_added_notification: {
        Args: { p_payload: Json }
        Returns: Json
      }
      sync_trip_share_link_cas_delete: {
        Args: { p_base_updated_at: string; p_id: string }
        Returns: Json
      }
      sync_trip_share_link_cas_upsert: {
        Args: { p_base_updated_at?: string; p_payload: Json }
        Returns: Json
      }
      sync_trip_weather_forecast_cas_upsert: {
        Args: { p_base_updated_at?: string; p_payload: Json }
        Returns: Json
      }
      sync_vault_entry_cas_delete: {
        Args: { p_base_updated_at: string; p_id: string }
        Returns: Json
      }
      sync_vault_entry_cas_upsert: {
        Args: { p_base_updated_at?: string; p_payload: Json }
        Returns: Json
      }
      sync_vault_keyset_cas_delete: {
        Args: { p_base_updated_at: string; p_id: string }
        Returns: Json
      }
      sync_vault_keyset_cas_upsert: {
        Args: { p_base_updated_at?: string; p_payload: Json }
        Returns: Json
      }
    }
    Enums: {
      connection_status: "pending" | "accepted" | "blocked"
      contact_relationship:
        | "family"
        | "friend"
        | "coworker"
        | "other"
        | "roommate"
      expense_split_type: "equal" | "exact" | "percentage" | "shares"
      invitation_status: "pending" | "accepted" | "rejected" | "revoked"
      notification_type:
        | "vote_pending"
        | "friend_request"
        | "settlement_pending"
        | "trip_alert"
        | "trip_invitation"
        | "trip_added"
      traveler_type: "adult" | "child"
      trip_member_role: "owner" | "editor" | "viewer"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      connection_status: ["pending", "accepted", "blocked"],
      contact_relationship: [
        "family",
        "friend",
        "coworker",
        "other",
        "roommate",
      ],
      expense_split_type: ["equal", "exact", "percentage", "shares"],
      invitation_status: ["pending", "accepted", "rejected", "revoked"],
      notification_type: [
        "vote_pending",
        "friend_request",
        "settlement_pending",
        "trip_alert",
        "trip_invitation",
        "trip_added",
      ],
      traveler_type: ["adult", "child"],
      trip_member_role: ["owner", "editor", "viewer"],
    },
  },
} as const

