export interface Project {
  id: string;
  name: string;
  budget: number;
  budget_mode: 'total' | 'category';
  status: 'Active' | 'Completed' | 'Archived';
  description: string | null;
  ai_context: string | null;
  known_vendors: string[];
  known_locations: string[];
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Invoice {
  id: string;
  vendor_name: string | null;
  invoice_date: string | null;
  invoice_number: string | null;
  currency: string | null;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  due_date: string | null;
  description: string | null;
  line_items: any | null;
  project_id: string | null;
  category_id: string | null;
  document_path: string | null;
  document_hash: string | null;
  processing_status: 'awaiting_info' | 'complete';
  payment_status: 'unpaid' | 'paid' | 'overdue' | 'partially_paid';
  follow_up_count: number;
  last_followed_up_at: string | null;
  human_notified_at: string | null;
  created_at: string;
  updated_at: string | null;
  // Joined fields
  project?: Project;
  category?: Category;
}

export interface UserSettings {
  id: string;
  company_name: string | null;
  base_currency: string;
  agentmail_inbox: string | null;
  max_followups: number;
  notification_channel: 'email' | 'none';
  onboarding_done: boolean;
  created_at: string;
}

export interface ProjectCategory {
  id: string;
  project_id: string;
  category_id: string;
  budget: number;
  created_at: string;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
}
