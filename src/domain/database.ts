export type AppRole = 'admin' | 'medical_staff' | 'organization_team' | 'user';
export type BusBoardingStatus = 'boarded' | 'on_way' | 'problem' | 'read';
export type EmergencyTeam = 'medical' | 'travel';
export type MemberType = 'brother' | 'sister';
export type TripGroupLocationStatus = 'declined' | 'pending' | 'shared';
export type TripGuidanceStatus =
  | 'almost_there'
  | 'at_meeting_point'
  | 'lost'
  | 'medical_help'
  | 'on_way'
  | 'problem';

export type UserProfile = {
  created_at: string;
  display_name: string;
  family_id: number | null;
  id: number;
  luggage_count: number;
  member_type: MemberType | null;
  party_size: number;
  role: AppRole;
  sim_card_count: number;
  updated_at: string;
  user_id: string;
};

export type AdminUserSummary = {
  display_name: string;
  emergency_on_duty: boolean;
  family_id: number | null;
  family_name: string | null;
  luggage_count: number;
  member_type: MemberType | null;
  party_size: number;
  role: AppRole;
  sim_card_count: number;
  user_id: string;
};

export type AccountFamily = {
  created_at: string;
  created_by_profile_id: number | null;
  id: number;
  name: string;
  updated_at: string;
};

export type GroupCheck = {
  closed_at: string | null;
  created_at: string;
  created_by_profile_id: number | null;
  id: number;
  question: string;
};

export type GroupCheckResponse = {
  answer: boolean;
  check_id: number;
  created_at: string;
  id: number;
  profile_id: number;
  updated_at: string;
};

export type AdminGroupCheckResult = {
  answer: boolean | null;
  display_name: string;
  party_size: number;
};

export type QuestionRound = {
  closed_at: string | null;
  created_at: string;
  id: number;
};

export type AnonymousQuestion = {
  checked_at: string | null;
  created_at: string;
  id: number;
  is_checked: boolean;
  question: string;
  round_id: number;
};

export type QuestionSubmissionLimit = {
  profile_id: number;
  round_id: number;
  submission_count: number;
};

export type ReligiousContentRecord = {
  content_policy: 'approved_for_offline' | 'linked_not_copied' | 'pending_rights_review';
  content_type: 'dua' | 'instruction' | 'salawat' | 'surah' | 'ziyarah';
  created_at: string;
  id: string;
  is_published: boolean;
  language: string;
  notes: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  slug: string;
  source_references: string[];
  title: string;
  updated_at: string;
  verification_status: 'draft' | 'needs_review' | 'rejected' | 'verified';
  version: string;
};

export type ReligiousTextParagraphRecord = {
  arabic: string;
  content_id: string;
  created_at: string;
  id: number;
  position: number;
  translation_de: string;
  transliteration: string;
};

export type RoleAssignmentAudit = {
  changed_by_profile_id: number | null;
  created_at: string;
  id: number;
  new_role: AppRole;
  previous_role: AppRole;
  target_user_id: string | null;
};

export type Trip = {
  archived_at: string | null;
  created_at: string;
  created_by_profile_id: number | null;
  id: number;
  name: string;
};

export type TripDailyProgram = {
  created_at: string;
  details: string;
  id: number;
  program_date: string;
  published_by_profile_id: number | null;
  title: string | null;
  trip_id: number;
  updated_at: string;
};

export type TripDailyProgramInput = {
  details: string;
  program_date: string;
  title: string;
};

export type TripBus = {
  created_at: string;
  id: number;
  leader_participant_id: number | null;
  name: string;
  sort_order: number;
  trip_id: number;
};

export type TripParticipant = {
  assignment_family_id: number | null;
  bus_id: number | null;
  created_at: string;
  display_name: string;
  id: number;
  participant_code: string;
  profile_id: number | null;
  trip_id: number;
  updated_at: string;
};

export type TripGroup = {
  created_at: string;
  created_by_profile_id: number | null;
  id: number;
  leader_participant_id: number;
  name: string;
  trip_id: number;
  updated_at: string;
};

export type TripGroupMember = {
  created_at: string;
  group_id: number;
  participant_id: number;
  trip_id: number;
};

export type TripGroupMemberSummary = {
  display_name: string;
  group_id: number;
  is_leader: boolean;
  participant_code: string;
  participant_id: number;
  trip_id: number;
};

export type TripGroupLocationRequest = {
  accuracy_meters: number | null;
  group_id: number;
  id: number;
  latitude: number | null;
  location_expires_at: string | null;
  longitude: number | null;
  requested_at: string;
  requested_by_profile_id: number | null;
  responded_at: string | null;
  status: TripGroupLocationStatus;
  trip_id: number;
};

export type TripNavigationDestination = {
  archived_at: string | null;
  created_at: string;
  created_by_profile_id: number | null;
  details: string | null;
  id: number;
  latitude: number;
  longitude: number;
  name: string;
  sort_order: number;
  trip_id: number;
  updated_at: string;
};

export type BusBoarding = {
  closed_at: string | null;
  created_by_profile_id: number | null;
  departure_at: string;
  id: number;
  opened_at: string;
  reminder_interval_minutes: number;
  title: string;
  trip_id: number;
  urgent_before_minutes: number;
};

export type BusBoardingResponse = {
  boarding_id: number;
  created_at: string;
  id: number;
  participant_id: number;
  status: BusBoardingStatus;
  trip_id: number;
  updated_at: string;
  updated_by_profile_id: number | null;
};

export type BusBoardingEscalation = {
  boarding_id: number;
  escalated_at: string;
  escalated_by_display_name: string;
  escalated_by_profile_id: number | null;
  id: number;
  participant_id: number;
  trip_id: number;
};

export type PushNotificationDevice = {
  created_at: string;
  expo_push_token: string;
  id: number;
  locale: 'ar' | 'de' | 'en';
  platform: 'android' | 'ios';
  profile_id: number;
  updated_at: string;
};

export type GeneralAlarmNotificationAttempt = {
  accepted_at: string | null;
  boarding_id: number;
  claimed_at: string;
  error_code: string | null;
  expected_status: BusBoardingStatus;
  id: number;
  participant_id: number;
  push_device_id: number;
  reminder_slot: number;
};

export type GeneralAlarmNotificationClaim = {
  attempt_id: number;
  boarding_id: number;
  departure_at: string;
  expected_status: BusBoardingStatus;
  expo_push_token: string;
  is_urgent: boolean;
  locale: string;
  participant_code: string;
  participant_id: number;
  platform: string;
  title: string;
};

export type EmergencyRequest = {
  accuracy_meters: number | null;
  created_at: string;
  id: number;
  latitude: number | null;
  location_label: string | null;
  longitude: number | null;
  message: string;
  requester_display_name: string;
  requester_profile_id: number | null;
  target_team: EmergencyTeam;
};

export type EmergencyRequestRecipient = {
  created_at: string;
  read_at: string | null;
  recipient_profile_id: number;
  request_id: number;
};

export type EmergencyNotificationAttempt = {
  accepted_at: string | null;
  claimed_at: string;
  error_code: string | null;
  id: number;
  push_device_id: number;
  recipient_profile_id: number;
  request_id: number;
};

export type EmergencyInboxMessage = {
  accuracy_meters: number | null;
  created_at: string;
  latitude: number | null;
  location_label: string | null;
  longitude: number | null;
  message: string;
  read_at: string | null;
  request_id: number;
  requester_display_name: string;
  target_team: EmergencyTeam;
};

export type EmergencySubmissionResult = {
  recipient_count: number;
  request_id: number;
};

export type EmergencyNotificationClaim = {
  attempt_id: number;
  expo_push_token: string;
  locale: string;
  request_id: number;
  target_team: EmergencyTeam;
};

export type EmergencyDashboardItem = Omit<
  EmergencyInboxMessage,
  'read_at'
>;

export type EmergencyTeamDuty = {
  assigned_at: string;
  assigned_by_display_name: string;
  assigned_by_profile_id: number | null;
  profile_id: number;
  team: EmergencyTeam;
};

export type EmergencyDutyNotification = {
  assigned_by_display_name: string;
  created_at: string;
  is_on_duty: boolean;
  notification_id: number;
  read_at: string | null;
  team: EmergencyTeam;
};

export type EmergencyDutyAssignmentResult = {
  emergency_on_duty: boolean;
  notification_id: number | null;
  profile_id: number;
};

export type EmergencyDutyNotificationAttempt = {
  accepted_at: string | null;
  claimed_at: string;
  error_code: string | null;
  id: number;
  notification_id: number;
  push_device_id: number;
};

export type EmergencyDutyNotificationClaim = {
  attempt_id: number;
  expo_push_token: string;
  locale: string;
  notification_id: number;
  team: EmergencyTeam;
};

export type TripGuidanceUpdate = {
  acts: string | null;
  closed_at: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  current_place_name: string;
  current_place_slug: string | null;
  departure_at: string;
  description: string | null;
  distance_hint: string | null;
  id: number;
  meeting_latitude: number | null;
  meeting_longitude: number | null;
  meeting_point: string;
  next_program_name: string;
  published_at: string;
  published_by_profile_id: number | null;
  relevant_gate: string | null;
  trip_id: number;
  updated_at: string;
};

export type TripGuidanceResponse = {
  acknowledged_at: string | null;
  acknowledged_by_display_name: string | null;
  acknowledged_by_profile_id: number | null;
  created_at: string;
  guidance_id: number;
  id: number;
  participant_id: number;
  status: TripGuidanceStatus;
  trip_id: number;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      account_families: {
        Insert: {
          created_at?: string;
          created_by_profile_id?: number | null;
          id?: never;
          name: string;
          updated_at?: string;
        };
        Relationships: [];
        Row: AccountFamily;
        Update: {
          name?: string;
          updated_at?: string;
        };
      };
      anonymous_questions: {
        Insert: {
          checked_at?: string | null;
          created_at?: string;
          id?: never;
          is_checked?: boolean;
          question: string;
          round_id: number;
        };
        Relationships: [];
        Row: AnonymousQuestion;
        Update: {
          checked_at?: string | null;
          is_checked?: boolean;
        };
      };
      bus_boarding_responses: {
        Insert: {
          boarding_id: number;
          created_at?: string;
          id?: never;
          participant_id: number;
          status: BusBoardingStatus;
          trip_id: number;
          updated_at?: string;
          updated_by_profile_id?: number | null;
        };
        Relationships: [];
        Row: BusBoardingResponse;
        Update: {
          status?: BusBoardingStatus;
          updated_at?: string;
          updated_by_profile_id?: number | null;
        };
      };
      bus_boarding_escalations: {
        Insert: {
          boarding_id: number;
          escalated_at?: string;
          escalated_by_display_name: string;
          escalated_by_profile_id?: number | null;
          id?: never;
          participant_id: number;
          trip_id: number;
        };
        Relationships: [];
        Row: BusBoardingEscalation;
        Update: {
          escalated_at?: string;
          escalated_by_display_name?: string;
          escalated_by_profile_id?: number | null;
        };
      };
      bus_boardings: {
        Insert: {
          closed_at?: string | null;
          created_by_profile_id?: number | null;
          departure_at: string;
          id?: never;
          opened_at?: string;
          reminder_interval_minutes?: number;
          title: string;
          trip_id: number;
          urgent_before_minutes?: number;
        };
        Relationships: [];
        Row: BusBoarding;
        Update: {
          closed_at?: string | null;
          departure_at?: string;
          reminder_interval_minutes?: number;
          title?: string;
          urgent_before_minutes?: number;
        };
      };
      emergency_notification_attempts: {
        Insert: {
          accepted_at?: string | null;
          claimed_at?: string;
          error_code?: string | null;
          id?: never;
          push_device_id: number;
          recipient_profile_id: number;
          request_id: number;
        };
        Relationships: [];
        Row: EmergencyNotificationAttempt;
        Update: {
          accepted_at?: string | null;
          error_code?: string | null;
        };
      };
      emergency_duty_notification_attempts: {
        Insert: {
          accepted_at?: string | null;
          claimed_at?: string;
          error_code?: string | null;
          id?: never;
          notification_id: number;
          push_device_id: number;
        };
        Relationships: [];
        Row: EmergencyDutyNotificationAttempt;
        Update: {
          accepted_at?: string | null;
          error_code?: string | null;
        };
      };
      emergency_duty_notifications: {
        Insert: {
          assigned_by_display_name: string;
          assigned_by_profile_id?: number | null;
          created_at?: string;
          id?: never;
          read_at?: string | null;
          recipient_profile_id: number;
          team: EmergencyTeam;
        };
        Relationships: [];
        Row: {
          assigned_by_display_name: string;
          assigned_by_profile_id: number | null;
          created_at: string;
          id: number;
          read_at: string | null;
          recipient_profile_id: number;
          team: EmergencyTeam;
        };
        Update: { read_at?: string | null };
      };
      emergency_team_duties: {
        Insert: {
          assigned_at?: string;
          assigned_by_display_name: string;
          assigned_by_profile_id?: number | null;
          profile_id: number;
          team: EmergencyTeam;
        };
        Relationships: [];
        Row: EmergencyTeamDuty;
        Update: {
          assigned_at?: string;
          assigned_by_display_name?: string;
          assigned_by_profile_id?: number | null;
          team?: EmergencyTeam;
        };
      };
      emergency_request_recipients: {
        Insert: {
          created_at?: string;
          read_at?: string | null;
          recipient_profile_id: number;
          request_id: number;
        };
        Relationships: [];
        Row: EmergencyRequestRecipient;
        Update: {
          read_at?: string | null;
        };
      };
      emergency_requests: {
        Insert: {
          accuracy_meters?: number | null;
          created_at?: string;
          id?: never;
          latitude?: number | null;
          location_label?: string | null;
          longitude?: number | null;
          message: string;
          requester_display_name: string;
          requester_profile_id?: number | null;
          target_team: EmergencyTeam;
        };
        Relationships: [];
        Row: EmergencyRequest;
        Update: never;
      };
      general_alarm_notification_attempts: {
        Insert: {
          accepted_at?: string | null;
          boarding_id: number;
          claimed_at?: string;
          error_code?: string | null;
          expected_status: BusBoardingStatus;
          id?: never;
          participant_id: number;
          push_device_id: number;
          reminder_slot: number;
        };
        Relationships: [];
        Row: GeneralAlarmNotificationAttempt;
        Update: {
          accepted_at?: string | null;
          error_code?: string | null;
        };
      };
      group_check_responses: {
        Insert: {
          answer: boolean;
          check_id: number;
          created_at?: string;
          id?: never;
          profile_id: number;
          updated_at?: string;
        };
        Relationships: [];
        Row: GroupCheckResponse;
        Update: {
          answer?: boolean;
          updated_at?: string;
        };
      };
      group_checks: {
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          created_by_profile_id?: number | null;
          id?: never;
          question: string;
        };
        Relationships: [];
        Row: GroupCheck;
        Update: {
          closed_at?: string | null;
        };
      };
      profiles: {
        Insert: {
          created_at?: string;
          display_name: string;
          family_id?: number | null;
          id?: never;
          luggage_count?: number;
          member_type?: MemberType | null;
          party_size?: number;
          role?: AppRole;
          sim_card_count?: number;
          updated_at?: string;
          user_id: string;
        };
        Relationships: [];
        Row: UserProfile;
        Update: {
          display_name?: string;
          family_id?: number | null;
          luggage_count?: number;
          member_type?: MemberType | null;
          party_size?: number;
          role?: AppRole;
          sim_card_count?: number;
          updated_at?: string;
        };
      };
      religious_contents: {
        Insert: {
          content_policy?: ReligiousContentRecord['content_policy'];
          content_type: ReligiousContentRecord['content_type'];
          created_at?: string;
          id: string;
          is_published?: boolean;
          language?: string;
          notes?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          slug: string;
          source_references: string[];
          title: string;
          updated_at?: string;
          verification_status?: ReligiousContentRecord['verification_status'];
          version: string;
        };
        Relationships: [];
        Row: ReligiousContentRecord;
        Update: {
          content_policy?: ReligiousContentRecord['content_policy'];
          content_type?: ReligiousContentRecord['content_type'];
          is_published?: boolean;
          language?: string;
          notes?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          slug?: string;
          source_references?: string[];
          title?: string;
          updated_at?: string;
          verification_status?: ReligiousContentRecord['verification_status'];
          version?: string;
        };
      };
      religious_text_paragraphs: {
        Insert: {
          arabic: string;
          content_id: string;
          created_at?: string;
          id?: never;
          position: number;
          translation_de: string;
          transliteration: string;
        };
        Relationships: [
          {
            foreignKeyName: 'religious_text_paragraphs_content_id_fkey';
            columns: ['content_id'];
            isOneToOne: false;
            referencedRelation: 'religious_contents';
            referencedColumns: ['id'];
          },
        ];
        Row: ReligiousTextParagraphRecord;
        Update: {
          arabic?: string;
          content_id?: string;
          position?: number;
          translation_de?: string;
          transliteration?: string;
        };
      };
      push_notification_devices: {
        Insert: {
          created_at?: string;
          expo_push_token: string;
          id?: never;
          locale?: 'ar' | 'de' | 'en';
          platform: 'android' | 'ios';
          profile_id: number;
          updated_at?: string;
        };
        Relationships: [];
        Row: PushNotificationDevice;
        Update: {
          expo_push_token?: string;
          locale?: 'ar' | 'de' | 'en';
          platform?: 'android' | 'ios';
          profile_id?: number;
          updated_at?: string;
        };
      };
      question_rounds: {
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          id?: never;
        };
        Relationships: [];
        Row: QuestionRound;
        Update: {
          closed_at?: string | null;
        };
      };
      question_submission_limits: {
        Insert: {
          profile_id: number;
          round_id: number;
          submission_count?: number;
        };
        Relationships: [];
        Row: QuestionSubmissionLimit;
        Update: {
          submission_count?: number;
        };
      };
      role_assignment_audit: {
        Insert: {
          changed_by_profile_id?: number | null;
          created_at?: string;
          id?: never;
          new_role: AppRole;
          previous_role: AppRole;
          target_user_id?: string | null;
        };
        Relationships: [];
        Row: RoleAssignmentAudit;
        Update: never;
      };
      trip_buses: {
        Insert: {
          created_at?: string;
          id?: never;
          leader_participant_id?: number | null;
          name: string;
          sort_order?: number;
          trip_id: number;
        };
        Relationships: [];
        Row: TripBus;
        Update: {
          leader_participant_id?: number | null;
          name?: string;
          sort_order?: number;
        };
      };
      trip_group_location_requests: {
        Insert: {
          accuracy_meters?: number | null;
          group_id: number;
          id?: never;
          latitude?: number | null;
          location_expires_at?: string | null;
          longitude?: number | null;
          requested_at?: string;
          requested_by_profile_id?: number | null;
          responded_at?: string | null;
          status?: TripGroupLocationStatus;
          trip_id: number;
        };
        Relationships: [];
        Row: TripGroupLocationRequest;
        Update: {
          accuracy_meters?: number | null;
          latitude?: number | null;
          location_expires_at?: string | null;
          longitude?: number | null;
          requested_at?: string;
          requested_by_profile_id?: number | null;
          responded_at?: string | null;
          status?: TripGroupLocationStatus;
        };
      };
      trip_group_members: {
        Insert: {
          created_at?: string;
          group_id: number;
          participant_id: number;
          trip_id: number;
        };
        Relationships: [];
        Row: TripGroupMember;
        Update: never;
      };
      trip_groups: {
        Insert: {
          created_at?: string;
          created_by_profile_id?: number | null;
          id?: never;
          leader_participant_id: number;
          name: string;
          trip_id: number;
          updated_at?: string;
        };
        Relationships: [];
        Row: TripGroup;
        Update: {
          leader_participant_id?: number;
          name?: string;
          updated_at?: string;
        };
      };
      trip_daily_programs: {
        Insert: {
          created_at?: string;
          details: string;
          id?: never;
          program_date: string;
          published_by_profile_id?: number | null;
          title?: string | null;
          trip_id: number;
          updated_at?: string;
        };
        Relationships: [];
        Row: TripDailyProgram;
        Update: {
          details?: string;
          program_date?: string;
          published_by_profile_id?: number | null;
          title?: string | null;
          updated_at?: string;
        };
      };
      trip_participants: {
        Insert: {
          assignment_family_id?: number | null;
          bus_id?: number | null;
          created_at?: string;
          display_name: string;
          id?: never;
          participant_code: string;
          profile_id?: number | null;
          trip_id: number;
          updated_at?: string;
        };
        Relationships: [];
        Row: TripParticipant;
        Update: {
          assignment_family_id?: number | null;
          bus_id?: number | null;
          display_name?: string;
          participant_code?: string;
          profile_id?: number | null;
          updated_at?: string;
        };
      };
      trip_navigation_destinations: {
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by_profile_id?: number | null;
          details?: string | null;
          id?: never;
          latitude: number;
          longitude: number;
          name: string;
          sort_order?: number;
          trip_id: number;
          updated_at?: string;
        };
        Relationships: [];
        Row: TripNavigationDestination;
        Update: {
          archived_at?: string | null;
          details?: string | null;
          latitude?: number;
          longitude?: number;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
      };
      trips: {
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by_profile_id?: number | null;
          id?: never;
          name: string;
        };
        Relationships: [];
        Row: Trip;
        Update: {
          archived_at?: string | null;
          name?: string;
        };
      };
      trip_guidance_responses: {
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by_display_name?: string | null;
          acknowledged_by_profile_id?: number | null;
          created_at?: string;
          guidance_id: number;
          id?: never;
          participant_id: number;
          status: TripGuidanceStatus;
          trip_id: number;
          updated_at?: string;
        };
        Relationships: [];
        Row: TripGuidanceResponse;
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by_display_name?: string | null;
          acknowledged_by_profile_id?: number | null;
          status?: TripGuidanceStatus;
          updated_at?: string;
        };
      };
      trip_guidance_updates: {
        Insert: {
          acts?: string | null;
          closed_at?: string | null;
          current_latitude?: number | null;
          current_longitude?: number | null;
          current_place_name: string;
          current_place_slug?: string | null;
          departure_at: string;
          description?: string | null;
          distance_hint?: string | null;
          id?: never;
          meeting_latitude?: number | null;
          meeting_longitude?: number | null;
          meeting_point: string;
          next_program_name: string;
          published_at?: string;
          published_by_profile_id?: number | null;
          relevant_gate?: string | null;
          trip_id: number;
          updated_at?: string;
        };
        Relationships: [];
        Row: TripGuidanceUpdate;
        Update: {
          acts?: string | null;
          closed_at?: string | null;
          current_latitude?: number | null;
          current_longitude?: number | null;
          current_place_name?: string;
          current_place_slug?: string | null;
          departure_at?: string;
          description?: string | null;
          distance_hint?: string | null;
          meeting_latitude?: number | null;
          meeting_longitude?: number | null;
          meeting_point?: string;
          next_program_name?: string;
          relevant_gate?: string | null;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_delete_account_family: {
        Args: { p_family_id: number };
        Returns: AccountFamily;
      };
      admin_archive_trip: {
        Args: { p_trip_id: number };
        Returns: Trip;
      };
      admin_escalate_bus_boarding_participant: {
        Args: { p_boarding_id: number; p_participant_id: number };
        Returns: BusBoardingEscalation;
      };
      admin_close_bus_boarding: {
        Args: { p_boarding_id: number };
        Returns: BusBoarding;
      };
      admin_create_trip: {
        Args: { p_name: string };
        Returns: Trip;
      };
      admin_create_trip_bus: {
        Args: { p_name: string; p_trip_id: number };
        Returns: TripBus;
      };
      admin_create_trip_bus_with_leader: {
        Args: { p_leader_user_id: string; p_name: string; p_trip_id: number };
        Returns: TripBus;
      };
      admin_copy_trip_bus_setup: {
        Args: { p_name: string; p_source_trip_id: number };
        Returns: Trip;
      };
      admin_delete_trip_group: {
        Args: { p_group_id: number };
        Returns: TripGroup;
      };
      admin_request_trip_group_location: {
        Args: { p_group_id: number };
        Returns: TripGroupLocationRequest;
      };
      admin_upsert_trip_daily_programs: {
        Args: { p_programs: TripDailyProgramInput[]; p_trip_id: number };
        Returns: TripDailyProgram[];
      };
      admin_upsert_trip_group: {
        Args: {
          p_group_id?: number | null;
          p_leader_participant_id: number;
          p_member_participant_ids: number[];
          p_name: string;
          p_trip_id: number;
        };
        Returns: TripGroup;
      };
      can_read_current_trip_daily_program: {
        Args: { p_trip_id: number };
        Returns: boolean;
      };
      admin_group_check_results: {
        Args: { p_check_id: number };
        Returns: AdminGroupCheckResult[];
      };
      admin_acknowledge_trip_guidance_problem: {
        Args: { p_response_id: number };
        Returns: TripGuidanceResponse;
      };
      admin_archive_trip_navigation_destination: {
        Args: { p_destination_id: number };
        Returns: TripNavigationDestination;
      };
      admin_publish_trip_guidance: {
        Args: {
          p_acts: string;
          p_current_latitude: number | null;
          p_current_longitude: number | null;
          p_current_place_name: string;
          p_current_place_slug: string;
          p_departure_at: string;
          p_description: string;
          p_distance_hint: string;
          p_meeting_latitude: number | null;
          p_meeting_longitude: number | null;
          p_meeting_point: string;
          p_next_program_name: string;
          p_relevant_gate: string;
          p_trip_id: number;
        };
        Returns: TripGuidanceUpdate;
      };
      admin_update_trip_guidance: {
        Args: {
          p_acts: string;
          p_current_latitude: number | null;
          p_current_longitude: number | null;
          p_current_place_name: string;
          p_current_place_slug: string;
          p_departure_at: string;
          p_description: string;
          p_distance_hint: string;
          p_guidance_id: number;
          p_meeting_latitude: number | null;
          p_meeting_longitude: number | null;
          p_meeting_point: string;
          p_next_program_name: string;
          p_relevant_gate: string;
        };
        Returns: TripGuidanceUpdate;
      };
      admin_upsert_trip_navigation_destination: {
        Args: {
          p_destination_id?: number | null;
          p_details: string;
          p_latitude: number;
          p_longitude: number;
          p_name: string;
          p_trip_id: number;
        };
        Returns: TripNavigationDestination;
      };
      admin_list_users: {
        Args: never;
        Returns: AdminUserSummary[];
      };
      admin_list_account_families: {
        Args: never;
        Returns: AccountFamily[];
      };
      admin_set_user_role: {
        Args: { p_role: AppRole; p_user_id: string };
        Returns: UserProfile;
      };
      admin_set_emergency_duty: {
        Args: { p_on_duty: boolean; p_user_id: string };
        Returns: EmergencyDutyAssignmentResult[];
      };
      admin_set_bus_boarding_status: {
        Args: {
          p_boarding_id: number;
          p_participant_id: number;
          p_status: BusBoardingStatus;
        };
        Returns: BusBoardingResponse;
      };
      admin_set_trip_bus_leader: {
        Args: { p_bus_id: number; p_leader_user_id: string };
        Returns: TripBus;
      };
      admin_start_bus_boarding: {
        Args: { p_departure_at: string; p_title: string; p_trip_id: number };
        Returns: BusBoarding;
      };
      admin_upsert_trip_participant: {
        Args: {
          p_bus_id: number | null;
          p_display_name: string;
          p_participant_code: string;
          p_trip_id: number;
          p_user_id: string | null;
        };
        Returns: TripParticipant;
      };
      admin_assign_trip_family: {
        Args: { p_bus_id: number; p_family_id: number; p_trip_id: number };
        Returns: TripParticipant[];
      };
      admin_assign_trip_person: {
        Args: { p_bus_id: number; p_trip_id: number; p_user_id: string };
        Returns: TripParticipant;
      };
      admin_upsert_account_family: {
        Args: {
          p_family_id?: number | null;
          p_member_user_ids: string[];
          p_name: string;
        };
        Returns: AccountFamily;
      };
      can_delete_account: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      can_dispatch_general_alarm: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      claim_emergency_notification_attempts: {
        Args: { p_request_id: number; p_requester_user_id: string };
        Returns: EmergencyNotificationClaim[];
      };
      claim_emergency_duty_notification_attempts: {
        Args: { p_assigner_user_id: string; p_notification_id: number };
        Returns: EmergencyDutyNotificationClaim[];
      };
      claim_due_general_alarm_notifications: {
        Args: never;
        Returns: GeneralAlarmNotificationClaim[];
      };
      complete_emergency_notification_attempt: {
        Args: {
          p_accepted: boolean;
          p_attempt_id: number;
          p_error_code: string;
        };
        Returns: undefined;
      };
      complete_emergency_duty_notification_attempt: {
        Args: {
          p_accepted: boolean;
          p_attempt_id: number;
          p_error_code: string;
        };
        Returns: undefined;
      };
      get_trip_group_member_summaries: {
        Args: never;
        Returns: TripGroupMemberSummary[];
      };
      complete_general_alarm_notification_attempts: {
        Args: {
          p_accepted: boolean;
          p_attempt_ids: number[];
          p_error_code: string;
        };
        Returns: undefined;
      };
      is_admin: {
        Args: never;
        Returns: boolean;
      };
      list_my_emergency_messages: {
        Args: never;
        Returns: EmergencyInboxMessage[];
      };
      list_emergency_dashboard: {
        Args: never;
        Returns: EmergencyDashboardItem[];
      };
      list_my_emergency_duty_notifications: {
        Args: never;
        Returns: EmergencyDutyNotification[];
      };
      mark_emergency_duty_notification_read: {
        Args: { p_notification_id: number };
        Returns: undefined;
      };
      mark_emergency_request_read: {
        Args: { p_request_id: number };
        Returns: undefined;
      };
      close_group_check: {
        Args: { p_check_id: number };
        Returns: GroupCheck;
      };
      close_question_round: {
        Args: { p_round_id: number };
        Returns: QuestionRound;
      };
      open_question_round: {
        Args: never;
        Returns: QuestionRound;
      };
      is_trip_member: {
        Args: { p_trip_id: number };
        Returns: boolean;
      };
      respond_to_group_check: {
        Args: { p_answer: boolean; p_check_id: number };
        Returns: GroupCheckResponse;
      };
      respond_to_trip_group_location: {
        Args: {
          p_accuracy_meters?: number | null;
          p_latitude?: number | null;
          p_longitude?: number | null;
          p_request_id: number;
          p_share: boolean;
        };
        Returns: TripGroupLocationRequest;
      };
      respond_to_trip_guidance: {
        Args: {
          p_guidance_id: number;
          p_participant_id: number;
          p_status: TripGuidanceStatus;
        };
        Returns: TripGuidanceResponse;
      };
      respond_to_bus_boarding: {
        Args: {
          p_boarding_id: number;
          p_participant_id: number;
          p_status: BusBoardingStatus;
        };
        Returns: BusBoardingResponse;
      };
      register_push_notification_device: {
        Args: {
          p_expo_push_token: string;
          p_locale: 'ar' | 'de' | 'en';
          p_platform: 'android' | 'ios';
        };
        Returns: undefined;
      };
      start_group_check: {
        Args: { p_question: string };
        Returns: GroupCheck;
      };
      set_anonymous_question_checked: {
        Args: { p_is_checked: boolean; p_question_id: number };
        Returns: AnonymousQuestion;
      };
      submit_anonymous_question: {
        Args: { p_question: string; p_round_id: number };
        Returns: AnonymousQuestion;
      };
      submit_emergency_request: {
        Args: {
          p_accuracy_meters?: number | null;
          p_latitude?: number | null;
          p_location_label?: string | null;
          p_longitude?: number | null;
          p_message: string;
          p_target_team: EmergencyTeam;
        };
        Returns: EmergencySubmissionResult[];
      };
      unregister_push_notification_device: {
        Args: { p_expo_push_token: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: AppRole;
      bus_boarding_status: BusBoardingStatus;
      member_type: MemberType;
      trip_group_location_status: TripGroupLocationStatus;
      trip_guidance_status: TripGuidanceStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
