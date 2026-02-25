export interface Project {
  id: string;
  name: string;
  budget: number;
  status: 'Active' | 'Completed';
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
}

export interface Invoice {
  id: string;
  vendor_name: string;
  invoice_date: string;
  invoice_number: string;
  currency: string;
  subtotal: number;
  vat: number;
  total: number;
  due_date: string | null;
  payment_terms: string | null;
  description: string | null;
  line_items: string | null;
  project_id: string | null;
  category_id: number | null;
  document_path: string | null;
  processed_at: string | null;
  payment_status: 'unpaid' | 'paid' | 'overdue';
  document_type: string;
  created_at: string;
  // Joined fields
  project?: Project;
  category?: Category;
}

export interface VendorMapping {
  id: number;
  vendor_name: string;
  project_id: string;
}

export interface UserSettings {
  id: string;
  company_name: string | null;
  email_address: string | null;
  email_provider: 'gmail' | 'outlook' | 'other' | null;
  onboarding_done: boolean;
  base_currency: string;
  created_at: string;
}
