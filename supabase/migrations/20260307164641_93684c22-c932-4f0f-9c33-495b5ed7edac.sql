CREATE TABLE public.vendor_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vendor_name text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.invoice_categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, vendor_name)
);

ALTER TABLE public.vendor_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own vendor mappings"
  ON public.vendor_mappings
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);