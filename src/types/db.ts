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
      anchor_proposals: {
        Row: {
          created_at: string
          created_by_user_id: string
          family_id: string
          formatted_address: string | null
          google_place_id: string | null
          id: string
          lat: number
          lng: number
          name: string
          note: string | null
          radius_mi: number
          trip_id: string
          withdrawn_at: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          family_id: string
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          lat: number
          lng: number
          name: string
          note?: string | null
          radius_mi?: number
          trip_id: string
          withdrawn_at?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          family_id?: string
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          note?: string | null
          radius_mi?: number
          trip_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anchor_proposals_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anchor_proposals_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      anchor_votes: {
        Row: {
          choice: Database["public"]["Enums"]["vote_choice"]
          family_id: string
          proposal_id: string
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          choice: Database["public"]["Enums"]["vote_choice"]
          family_id: string
          proposal_id: string
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          choice?: Database["public"]["Enums"]["vote_choice"]
          family_id?: string
          proposal_id?: string
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anchor_votes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anchor_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "anchor_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anchor_votes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      date_proposals: {
        Row: {
          created_at: string
          created_by_user_id: string
          end_date: string
          family_id: string
          id: string
          note: string | null
          start_date: string
          trip_id: string
          withdrawn_at: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          end_date: string
          family_id: string
          id?: string
          note?: string | null
          start_date: string
          trip_id: string
          withdrawn_at?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          end_date?: string
          family_id?: string
          id?: string
          note?: string | null
          start_date?: string
          trip_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "date_proposals_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_proposals_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      date_votes: {
        Row: {
          choice: Database["public"]["Enums"]["vote_choice"]
          family_id: string
          proposal_id: string
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          choice: Database["public"]["Enums"]["vote_choice"]
          family_id: string
          proposal_id: string
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          choice?: Database["public"]["Enums"]["vote_choice"]
          family_id?: string
          proposal_id?: string
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_votes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "date_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_votes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      destination_proposals: {
        Row: {
          created_at: string
          created_by_user_id: string
          family_id: string
          formatted_address: string | null
          google_place_id: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          note: string | null
          photo_url: string | null
          trip_id: string
          withdrawn_at: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          family_id: string
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          note?: string | null
          photo_url?: string | null
          trip_id: string
          withdrawn_at?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          family_id?: string
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          note?: string | null
          photo_url?: string | null
          trip_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "destination_proposals_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "destination_proposals_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      destination_votes: {
        Row: {
          choice: Database["public"]["Enums"]["vote_choice"]
          family_id: string
          proposal_id: string
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          choice: Database["public"]["Enums"]["vote_choice"]
          family_id: string
          proposal_id: string
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          choice?: Database["public"]["Enums"]["vote_choice"]
          family_id?: string
          proposal_id?: string
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "destination_votes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "destination_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "destination_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "destination_votes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["family_status"]
          trip_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["family_status"]
          trip_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["family_status"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "families_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      family_attendees: {
        Row: {
          age: number | null
          created_at: string
          family_id: string
          id: string
          name: string | null
        }
        Insert: {
          age?: number | null
          created_at?: string
          family_id: string
          id?: string
          name?: string | null
        }
        Update: {
          age?: number | null
          created_at?: string
          family_id?: string
          id?: string
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_attendees_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          created_at: string
          email: string
          family_id: string
          id: string
          is_primary: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          family_id: string
          id?: string
          is_primary?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          family_id?: string
          id?: string
          is_primary?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_proposal_votes: {
        Row: {
          approve: boolean
          created_at: string
          family_id: string
          proposal_id: string
          trip_id: string
          user_id: string
        }
        Insert: {
          approve: boolean
          created_at?: string
          family_id: string
          proposal_id: string
          trip_id: string
          user_id: string
        }
        Update: {
          approve?: boolean
          created_at?: string
          family_id?: string
          proposal_id?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_proposal_votes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_proposal_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "family_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_proposal_votes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      family_proposals: {
        Row: {
          created_at: string
          created_family_id: string | null
          id: string
          note: string | null
          proposed_adults: number
          proposed_by_family_id: string | null
          proposed_by_user_id: string
          proposed_children: number
          proposed_emails: string[]
          proposed_name: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          trip_id: string
        }
        Insert: {
          created_at?: string
          created_family_id?: string | null
          id?: string
          note?: string | null
          proposed_adults?: number
          proposed_by_family_id?: string | null
          proposed_by_user_id: string
          proposed_children?: number
          proposed_emails: string[]
          proposed_name: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          trip_id: string
        }
        Update: {
          created_at?: string
          created_family_id?: string | null
          id?: string
          note?: string | null
          proposed_adults?: number
          proposed_by_family_id?: string | null
          proposed_by_user_id?: string
          proposed_children?: number
          proposed_emails?: string[]
          proposed_name?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_proposals_created_family_id_fkey"
            columns: ["created_family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_proposals_proposed_by_family_id_fkey"
            columns: ["proposed_by_family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_proposals_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          family_id: string
          id: string
          sent_at: string | null
          token: string
          trip_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          family_id: string
          id?: string
          sent_at?: string | null
          token?: string
          trip_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          family_id?: string
          id?: string
          sent_at?: string | null
          token?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      lodging_candidates: {
        Row: {
          added_by_family_id: string | null
          address: string | null
          capacity_note: string | null
          created_at: string
          google_place_id: string | null
          housing_type: Database["public"]["Enums"]["housing_type"] | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          photo_url: string | null
          price_note: string | null
          rating: number | null
          source: Database["public"]["Enums"]["lodging_source"]
          trip_id: string
          url: string | null
        }
        Insert: {
          added_by_family_id?: string | null
          address?: string | null
          capacity_note?: string | null
          created_at?: string
          google_place_id?: string | null
          housing_type?: Database["public"]["Enums"]["housing_type"] | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          photo_url?: string | null
          price_note?: string | null
          rating?: number | null
          source: Database["public"]["Enums"]["lodging_source"]
          trip_id: string
          url?: string | null
        }
        Update: {
          added_by_family_id?: string | null
          address?: string | null
          capacity_note?: string | null
          created_at?: string
          google_place_id?: string | null
          housing_type?: Database["public"]["Enums"]["housing_type"] | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          photo_url?: string | null
          price_note?: string | null
          rating?: number | null
          source?: Database["public"]["Enums"]["lodging_source"]
          trip_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lodging_candidates_added_by_family_id_fkey"
            columns: ["added_by_family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodging_candidates_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      lodging_picks: {
        Row: {
          candidate_id: string
          created_at: string
          family_id: string
          rank: number
          trip_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          family_id: string
          rank: number
          trip_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          family_id?: string
          rank?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lodging_picks_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "lodging_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodging_picks_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodging_picks_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      lodging_prefs: {
        Row: {
          family_id: string
          housing_types: Database["public"]["Enums"]["housing_type"][]
          stay_together_pref: Database["public"]["Enums"]["stay_together_pref"]
          trip_id: string
          updated_at: string
        }
        Insert: {
          family_id: string
          housing_types?: Database["public"]["Enums"]["housing_type"][]
          stay_together_pref?: Database["public"]["Enums"]["stay_together_pref"]
          trip_id: string
          updated_at?: string
        }
        Update: {
          family_id?: string
          housing_types?: Database["public"]["Enums"]["housing_type"][]
          stay_together_pref?: Database["public"]["Enums"]["stay_together_pref"]
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lodging_prefs_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodging_prefs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      lodging_selection_families: {
        Row: {
          family_id: string
          selection_id: string
        }
        Insert: {
          family_id: string
          selection_id: string
        }
        Update: {
          family_id?: string
          selection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lodging_selection_families_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodging_selection_families_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "lodging_selections"
            referencedColumns: ["id"]
          },
        ]
      }
      lodging_selections: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          label: string | null
          trip_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          label?: string | null
          trip_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          label?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lodging_selections_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "lodging_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodging_selections_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      phase_signoffs: {
        Row: {
          family_id: string
          phase: Database["public"]["Enums"]["trip_phase"]
          signed_off_at: string
          trip_id: string
        }
        Insert: {
          family_id: string
          phase: Database["public"]["Enums"]["trip_phase"]
          signed_off_at?: string
          trip_id: string
        }
        Update: {
          family_id?: string
          phase?: Database["public"]["Enums"]["trip_phase"]
          signed_off_at?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_signoffs_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_signoffs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          agreed_end_date: string | null
          agreed_start_date: string | null
          anchor_lat: number | null
          anchor_lng: number | null
          anchor_name: string | null
          anchor_radius_mi: number | null
          created_at: string
          destination_lat: number | null
          destination_lng: number | null
          destination_name: string | null
          housing_types: Database["public"]["Enums"]["housing_type"][] | null
          id: string
          name: string
          organizer_user_id: string
          phase: Database["public"]["Enums"]["trip_phase"]
          stay_together: boolean | null
          target_finalize_by: string
          updated_at: string
        }
        Insert: {
          agreed_end_date?: string | null
          agreed_start_date?: string | null
          anchor_lat?: number | null
          anchor_lng?: number | null
          anchor_name?: string | null
          anchor_radius_mi?: number | null
          created_at?: string
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          housing_types?: Database["public"]["Enums"]["housing_type"][] | null
          id?: string
          name: string
          organizer_user_id: string
          phase?: Database["public"]["Enums"]["trip_phase"]
          stay_together?: boolean | null
          target_finalize_by?: string
          updated_at?: string
        }
        Update: {
          agreed_end_date?: string | null
          agreed_start_date?: string | null
          anchor_lat?: number | null
          anchor_lng?: number | null
          anchor_name?: string | null
          anchor_radius_mi?: number | null
          created_at?: string
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          housing_types?: Database["public"]["Enums"]["housing_type"][] | null
          id?: string
          name?: string
          organizer_user_id?: string
          phase?: Database["public"]["Enums"]["trip_phase"]
          stay_together?: boolean | null
          target_finalize_by?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      advance_phase: {
        Args: {
          p_to: Database["public"]["Enums"]["trip_phase"]
          p_trip_id: string
        }
        Returns: Database["public"]["Enums"]["trip_phase"]
      }
      clear_lodging_selection: {
        Args: { p_selection_id: string; p_trip_id: string }
        Returns: undefined
      }
      create_trip: {
        Args: { p_family_name: string; p_name: string; p_target_days?: number }
        Returns: string
      }
      invite_family: {
        Args: { p_emails: string[]; p_name: string; p_trip_id: string }
        Returns: string
      }
      is_trip_member: { Args: { p_trip_id: string }; Returns: boolean }
      is_trip_organizer: { Args: { p_trip_id: string }; Returns: boolean }
      my_family_id: { Args: { p_trip_id: string }; Returns: string }
      propose_family: {
        Args: {
          p_adults?: number
          p_children?: number
          p_emails: string[]
          p_name: string
          p_note?: string
          p_trip_id: string
        }
        Returns: string
      }
      resolve_anchor: {
        Args: { p_proposal_id: string; p_trip_id: string }
        Returns: undefined
      }
      resolve_dates: {
        Args: { p_proposal_id: string; p_trip_id: string }
        Returns: undefined
      }
      resolve_destination: {
        Args: { p_proposal_id: string; p_trip_id: string }
        Returns: undefined
      }
      resolve_lodging_prefs: { Args: { p_trip_id: string }; Returns: undefined }
      set_family_status: {
        Args: {
          p_family_id: string
          p_status: Database["public"]["Enums"]["family_status"]
        }
        Returns: undefined
      }
      set_lodging_selection: {
        Args: {
          p_candidate_id: string
          p_family_ids: string[]
          p_label?: string
          p_trip_id: string
        }
        Returns: string
      }
      set_trip_target: {
        Args: { p_target: string; p_trip_id: string }
        Returns: undefined
      }
      trip_of_family: { Args: { p_family_id: string }; Returns: string }
      vote_family_proposal: {
        Args: { p_approve: boolean; p_proposal_id: string }
        Returns: Database["public"]["Enums"]["proposal_status"]
      }
    }
    Enums: {
      family_status: "invited" | "active" | "opted_out" | "removed"
      housing_type:
        | "hotel"
        | "short_term_rental"
        | "resort"
        | "cabin"
        | "hostel"
      lodging_source: "google" | "manual"
      proposal_status: "pending" | "approved" | "rejected"
      stay_together_pref: "together" | "separate_ok" | "no_preference"
      trip_phase:
        | "invites"
        | "dates"
        | "destination"
        | "anchor"
        | "lodging"
        | "finalized"
      vote_choice: "yes" | "maybe" | "no"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      family_status: ["invited", "active", "opted_out", "removed"],
      housing_type: ["hotel", "short_term_rental", "resort", "cabin", "hostel"],
      lodging_source: ["google", "manual"],
      proposal_status: ["pending", "approved", "rejected"],
      stay_together_pref: ["together", "separate_ok", "no_preference"],
      trip_phase: [
        "invites",
        "dates",
        "destination",
        "anchor",
        "lodging",
        "finalized",
      ],
      vote_choice: ["yes", "maybe", "no"],
    },
  },
} as const

