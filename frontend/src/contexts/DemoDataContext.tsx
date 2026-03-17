import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Invoice, Project, Category } from '@/types/database';

// Helper: date relative to today
const daysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const today = () => new Date().toISOString().split('T')[0];

// Stable IDs
const P1 = 'demo-proj-atlantic';
const P2 = 'demo-proj-wildcoast';
const P3 = 'demo-proj-desert';
const C_CAMERA = 'demo-cat-camera';
const C_LIGHTING = 'demo-cat-lighting';
const C_CATERING = 'demo-cat-catering';
const C_AERIAL = 'demo-cat-aerial';
const C_POST = 'demo-cat-post';
const C_EDITING = 'demo-cat-editing';
const C_AUDIO = 'demo-cat-audio';
const C_LOCATIONS = 'demo-cat-locations';
const C_LOGISTICS = 'demo-cat-logistics';

const DEMO_PROJECTS: Project[] = [
  { id: P1, name: 'Atlantic Documentary', budget: 120000, status: 'Active', description: 'Feature-length ocean documentary', ai_context: null, known_vendors: [], known_locations: [], created_at: daysFromNow(-60) },
  { id: P2, name: 'Wild Coast Series', budget: 90000, status: 'Active', description: '6-part coastal wildlife series', ai_context: null, known_vendors: [], known_locations: [], created_at: daysFromNow(-45) },
  { id: P3, name: 'Desert Expedition', budget: 50000, status: 'Active', description: 'Sahara crossing documentary', ai_context: null, known_vendors: [], known_locations: [], created_at: daysFromNow(-30) },
];

const DEMO_CATEGORIES: Category[] = [
  { id: C_CAMERA, name: 'Camera' },
  { id: C_LIGHTING, name: 'Lighting' },
  { id: C_CATERING, name: 'Catering' },
  { id: C_AERIAL, name: 'Aerial' },
  { id: C_POST, name: 'Post Production' },
  { id: C_EDITING, name: 'Editing' },
  { id: C_AUDIO, name: 'Audio' },
  { id: C_LOCATIONS, name: 'Locations' },
  { id: C_LOGISTICS, name: 'Logistics' },
];

const makeInvoice = (
  id: string,
  vendor: string,
  categoryId: string,
  projectId: string,
  total: number,
  status: 'paid' | 'unpaid' | 'overdue',
  dueDateOffset?: number,
  invoiceDateOffset: number = -30,
): Invoice => {
  const paymentStatus = status === 'overdue' ? 'overdue' : status;
  const dueDate = dueDateOffset != null ? daysFromNow(dueDateOffset) : (status === 'paid' ? daysFromNow(-20) : daysFromNow(14));
  return {
    id,
    vendor_name: vendor,
    invoice_date: daysFromNow(invoiceDateOffset),
    invoice_number: `INV-${id.slice(-4).toUpperCase()}`,
    currency: 'EUR',
    subtotal: Math.round(total * 0.8),
    vat: Math.round(total * 0.2),
    total,
    due_date: dueDate,
    description: null,
    line_items: null,
    project_id: projectId,
    category_id: categoryId,
    document_path: null,
    document_hash: null,
    processing_status: 'complete',
    payment_status: paymentStatus,
    follow_up_count: 0,
    last_followed_up_at: null,
    human_notified_at: null,
    created_at: daysFromNow(invoiceDateOffset),
    updated_at: null,
    project: DEMO_PROJECTS.find(p => p.id === projectId),
    category: DEMO_CATEGORIES.find(c => c.id === categoryId),
  };
};

const DEMO_INVOICES: Invoice[] = [
  // Atlantic Documentary
  makeInvoice('demo-inv-001', 'Atlantic Camera Hire', C_CAMERA, P1, 8500, 'unpaid', 7, -25),
  makeInvoice('demo-inv-002', 'Pinewood Lighting & Grip', C_LIGHTING, P1, 6200, 'paid', undefined, -40),
  makeInvoice('demo-inv-003', 'Lisbon Catering Co', C_CATERING, P1, 2100, 'overdue', -14, -35),
  makeInvoice('demo-inv-004', 'Northern Drone Services', C_AERIAL, P1, 3800, 'unpaid', 3, -20),
  // Wild Coast Series
  makeInvoice('demo-inv-005', 'Studio X Post Production', C_POST, P2, 28000, 'unpaid', 10, -50),
  makeInvoice('demo-inv-006', 'Atlantic Camera Hire', C_CAMERA, P2, 16500, 'paid', undefined, -55),
  makeInvoice('demo-inv-007', 'Southbank Edit Suite', C_EDITING, P2, 14000, 'unpaid', 12, -45),
  makeInvoice('demo-inv-008', 'London Sound Design', C_AUDIO, P2, 8200, 'paid', undefined, -60),
  // Desert Expedition (over budget: total = 53,700 > 50,000)
  makeInvoice('demo-inv-009', 'Sahara Locations', C_LOCATIONS, P3, 22000, 'paid', undefined, -28),
  makeInvoice('demo-inv-010', 'Atlas Transport', C_LOGISTICS, P3, 18500, 'unpaid', 5, -22),
  makeInvoice('demo-inv-011', 'Drone Cinematics Ltd', C_AERIAL, P3, 13200, 'unpaid', 8, -18),
];

const DEMO_PROJECT_CATEGORIES = [
  { id: 'demo-pc-1', project_id: P1, category_id: C_CAMERA, budget: 30000, created_at: '' },
  { id: 'demo-pc-2', project_id: P1, category_id: C_LIGHTING, budget: 20000, created_at: '' },
  { id: 'demo-pc-3', project_id: P1, category_id: C_CATERING, budget: 10000, created_at: '' },
  { id: 'demo-pc-4', project_id: P1, category_id: C_AERIAL, budget: 15000, created_at: '' },
  { id: 'demo-pc-5', project_id: P2, category_id: C_POST, budget: 30000, created_at: '' },
  { id: 'demo-pc-6', project_id: P2, category_id: C_CAMERA, budget: 20000, created_at: '' },
  { id: 'demo-pc-7', project_id: P2, category_id: C_EDITING, budget: 20000, created_at: '' },
  { id: 'demo-pc-8', project_id: P2, category_id: C_AUDIO, budget: 10000, created_at: '' },
  { id: 'demo-pc-9', project_id: P3, category_id: C_LOCATIONS, budget: 25000, created_at: '' },
  { id: 'demo-pc-10', project_id: P3, category_id: C_LOGISTICS, budget: 15000, created_at: '' },
  { id: 'demo-pc-11', project_id: P3, category_id: C_AERIAL, budget: 10000, created_at: '' },
];

interface DemoDataContextType {
  isDemoMode: boolean;
  demoProjects: Project[];
  demoInvoices: Invoice[];
  demoCategories: Category[];
  demoProjectCategories: typeof DEMO_PROJECT_CATEGORIES;
  demoCurrency: string;
  setDemoCurrency: (c: string) => void;
  startDemo: () => void;
  stopDemo: () => void;
}

const DemoDataContext = createContext<DemoDataContextType | null>(null);

export const useDemoData = () => {
  const ctx = useContext(DemoDataContext);
  if (!ctx) throw new Error('useDemoData must be used within DemoDataProvider');
  return ctx;
};

export const DemoDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoCurrency, setDemoCurrency] = useState('EUR');

  const startDemo = useCallback(() => setIsDemoMode(true), []);
  const stopDemo = useCallback(() => { setIsDemoMode(false); setDemoCurrency('EUR'); }, []);

  const value = useMemo(() => ({
    isDemoMode,
    demoProjects: DEMO_PROJECTS,
    demoInvoices: DEMO_INVOICES,
    demoCategories: DEMO_CATEGORIES,
    demoProjectCategories: DEMO_PROJECT_CATEGORIES,
    demoCurrency,
    setDemoCurrency,
    startDemo,
    stopDemo,
  }), [isDemoMode, demoCurrency, startDemo, stopDemo]);

  return (
    <DemoDataContext.Provider value={value}>
      {children}
    </DemoDataContext.Provider>
  );
};
