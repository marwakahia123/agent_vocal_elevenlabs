// ============================================================
// HallCall - Database Types
// ============================================================

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  plan: "free" | "starter" | "pro" | "enterprise";
  minutes_used: number;
  minutes_limit: number;
  created_at: string;
  updated_at: string;
}

export interface PhoneNumber {
  id: string;
  user_id: string;
  phone_number: string;
  label: string;
  agent_id: string | null;
  status: "active" | "inactive" | "pending";
  provider: string;
  created_at: string;
  updated_at: string;
}

export interface WidgetConfig {
  // Legacy
  position: "bottom-right" | "bottom-left";
  primaryColor: string;
  greeting: string;
  width: number;
  height: number;
  // Apparence
  variant: "compact" | "full";
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  focusColor: string;
  activeButtonColor: string;
  buttonFocusColor: string;
  borderRadius: number;
  buttonRadius: number;
  // Avatar
  avatarType: "orb" | "link" | "image";
  avatarColor1: string;
  avatarColor2: string;
  avatarImageUrl: string;
  // Contenu du texte
  startCallText: string;
  endCallText: string;
  callToAction: string;
  listeningText: string;
  speakingText: string;
}

export interface Widget {
  id: string;
  user_id: string;
  name: string;
  agent_id: string | null;
  embed_token: string;
  config: Partial<WidgetConfig>;
  domain_whitelist: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Integration {
  id: string;
  user_id: string;
  provider: "google" | "microsoft" | "smtp";
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[];
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  city: string | null;
  country: string;
  tags: string[];
  notes: string;
  source: "manual" | "import" | "widget" | "campaign";
  created_at: string;
  updated_at: string;
}

export interface CampaignGroup {
  id: string;
  user_id: string;
  name: string;
  description: string;
  agent_id: string | null;
  status: "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled";
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_contacts: number;
  contacts_called: number;
  contacts_answered: number;
  contacts_failed: number;
  budget_euros: number | null;
  cost_euros: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignContact {
  id: string;
  campaign_id: string;
  contact_id: string;
  status: "pending" | "calling" | "answered" | "no_answer" | "busy" | "failed" | "completed";
  call_duration_seconds: number | null;
  called_at: string | null;
  conversation_id: string | null;
  notes: string;
  created_at: string;
  // Joined fields
  contact?: Contact;
}

export interface Appointment {
  id: string;
  user_id: string;
  contact_id: string | null;
  agent_id: string | null;
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  location: string;
  status: "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show";
  external_calendar_id: string | null;
  external_event_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  contact?: Contact;
}

export interface SupportTicket {
  id: string;
  user_id: string;
  ticket_number: number;
  case_number: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  subject: string;
  description: string;
  status: "open" | "in_progress" | "waiting" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  category: "general" | "technical" | "billing" | "feature_request" | "bug";
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  contact?: Contact;
  comments?: TicketComment[];
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  content: string;
  is_internal: boolean;
  created_at: string;
}

export interface SmsTemplate {
  id: string;
  user_id: string;
  name: string;
  content: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SmsHistoryEntry {
  id: string;
  user_id: string;
  contact_id: string | null;
  template_id: string | null;
  phone_to: string;
  content: string;
  status: "pending" | "sent" | "delivered" | "failed";
  sent_at: string;
  delivered_at: string | null;
  error_message: string | null;
  // Joined fields
  contact?: Contact;
}

export interface BillingEvent {
  id: string;
  user_id: string;
  event_type: "subscription_start" | "subscription_renewal" | "subscription_cancel" | "plan_change" | "overage_charge" | "credit_purchase";
  amount_euros: number;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface KnowledgeBaseItem {
  id: string;
  user_id: string;
  agent_id: string;
  elevenlabs_agent_id: string;
  file_name: string;
  file_type: "pdf" | "txt" | "url";
  file_size_bytes: number | null;
  elevenlabs_doc_id: string | null;
  status: "uploading" | "processing" | "ready" | "failed";
  url: string | null;
  created_at: string;
}

// Agent RDV Config
export interface TransferCondition {
  name: string;
  phone: string;
  condition: string;
  instructions: string;
  time_restricted: boolean;
  timezone: string;
  time_from: string;
  time_to: string;
  active_days: string[];
}

export interface AgentRdvConfig {
  id: string;
  agent_id: string;
  user_id: string;
  availability_enabled: boolean;
  working_days: string[];
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  breaks: { start: string; end: string }[];
  min_delay_hours: number;
  max_horizon_days: number;
  transfer_enabled: boolean;
  always_transfer: boolean;
  transfer_conditions: TransferCondition[];
  default_transfer_number: string | null;
  sms_notification_enabled: boolean;
  email_notification_enabled: boolean;
  sms_template_id: string | null;
  email_template_id: string | null;
  webhook_secret: string;
  created_at: string;
  updated_at: string;
}

// Agent Support Config
export interface AgentSupportConfig {
  id: string;
  agent_id: string;
  user_id: string;
  transfer_enabled: boolean;
  always_transfer: boolean;
  transfer_conditions: TransferCondition[];
  default_transfer_number: string | null;
  sms_enabled: boolean;
  email_enabled: boolean;
  sms_template_id: string | null;
  email_template_id: string | null;
  default_priority: string;
  webhook_secret: string;
  created_at: string;
  updated_at: string;
}

// Agent Order Config
export interface AgentOrderConfig {
  id: string;
  agent_id: string;
  user_id: string;
  transfer_enabled: boolean;
  always_transfer: boolean;
  transfer_conditions: TransferCondition[];
  default_transfer_number: string | null;
  sms_enabled: boolean;
  email_enabled: boolean;
  sms_template_id: string | null;
  email_template_id: string | null;
  currency: string;
  tax_rate: number;
  webhook_secret: string;
  created_at: string;
  updated_at: string;
}

// Agent Commercial Config
export interface AgentCommercialConfig {
  id: string;
  agent_id: string;
  user_id: string;
  product_name: string | null;
  product_description: string | null;
  sales_pitch: string | null;
  objection_handling: string | null;
  filler_words: string[];
  availability_enabled: boolean;
  working_days: string[];
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  breaks: { start: string; end: string }[];
  min_delay_hours: number;
  max_horizon_days: number;
  transfer_enabled: boolean;
  always_transfer: boolean;
  transfer_conditions: TransferCondition[];
  default_transfer_number: string | null;
  sms_enabled: boolean;
  email_enabled: boolean;
  sms_template_id: string | null;
  email_template_id: string | null;
  meeting_link: string | null;
  webhook_secret: string;
  created_at: string;
  updated_at: string;
}

// Lead (qualification prospect)
export interface Lead {
  id: string;
  user_id: string;
  contact_id: string | null;
  agent_id: string | null;
  conversation_id: string | null;
  campaign_contact_id: string | null;
  status: 'pending' | 'interested' | 'not_interested' | 'callback' | 'transferred' | 'converted';
  interest_level: number | null;
  notes: string | null;
  callback_date: string | null;
  appointment_date: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_company: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  contact?: Contact;
}

// Notification Template
export interface NotificationTemplate {
  id: string;
  user_id: string;
  name: string;
  channel: 'sms' | 'email';
  agent_type: 'rdv' | 'support' | 'order' | 'commercial';
  subject: string | null;
  content: string;
  variables: string[];
  is_default: boolean;
  header_color: string;
  created_at: string;
  updated_at: string;
}

// Order
export interface Order {
  id: string;
  user_id: string;
  contact_id: string | null;
  agent_id: string | null;
  conversation_id: string | null;
  order_number: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  notes: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled";
  created_at: string;
  updated_at: string;
  // Joined fields
  order_items?: OrderItem[];
  contact?: Contact;
}

// Order Item
export interface OrderItem {
  id: string;
  order_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string | null;
  created_at: string;
}

// Dashboard aggregated stats
export interface DashboardStats {
  total_calls: number;
  total_minutes: number;
  active_agents: number;
  total_contacts: number;
  success_rate: number;
  avg_satisfaction: number;
  calls_today: number;
  calls_this_week: number;
  calls_by_day: { date: string; count: number; minutes: number }[];
  calls_by_type: { type: string; count: number }[];
}
