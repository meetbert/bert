import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Invoice, Project, Category } from '@/types/database';

// Helper: date relative to today
const daysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

// Stable IDs — Projects
const P_SHADOWS = 'demo-proj-shadows';
const P_ARCTIC  = 'demo-proj-arctic';
const P_OCEAN   = 'demo-proj-ocean';

// Stable IDs — Categories
const C_ACCOMMODATION    = 'demo-cat-accommodation';
const C_CONTRIBUTOR_FEES = 'demo-cat-contributor-fees';
const C_CREW_FREELANCE   = 'demo-cat-crew-freelance';
const C_EQUIPMENT        = 'demo-cat-equipment';
const C_INSURANCE        = 'demo-cat-insurance';
const C_LOCATION_RENTAL  = 'demo-cat-location-rental';
const C_MUSIC_LICENSING  = 'demo-cat-music-licensing';
const C_OFFICE_SUPPLIES  = 'demo-cat-office-supplies';
const C_OFFICE_ADMIN     = 'demo-cat-office-admin';
const C_OTHER            = 'demo-cat-other';
const C_POST_PRODUCTION  = 'demo-cat-post-production';
const C_TRAVEL           = 'demo-cat-travel';

const DEMO_PROJECTS: Project[] = [
  { id: P_SHADOWS, name: 'Shadows of the Atlantic', budget: 49000, budget_mode: 'total', status: 'Active', description: 'A feature-length documentary exploring historic transatlantic voyages...', ai_context: null, known_vendors: [], known_locations: [], created_at: daysFromNow(-31) },
  { id: P_ARCTIC, name: 'Arctic Light Documentary', budget: 30000, budget_mode: 'total', status: 'Completed', description: 'A feature-length observational documentary following climate scientists...', ai_context: null, known_vendors: [], known_locations: [], created_at: daysFromNow(-31) },
  { id: P_OCEAN, name: 'Wild Ocean Series', budget: 56000, budget_mode: 'category', status: 'Active', description: 'A three-part blue-chip documentary series examining threatened ecosystems...', ai_context: null, known_vendors: [], known_locations: [], created_at: daysFromNow(-31) },
];

const DEMO_CATEGORIES: Category[] = [
  { id: C_ACCOMMODATION, name: 'Accommodation' },
  { id: C_CONTRIBUTOR_FEES, name: 'Contributor Fees' },
  { id: C_CREW_FREELANCE, name: 'Crew/Freelance' },
  { id: C_EQUIPMENT, name: 'Equipment' },
  { id: C_INSURANCE, name: 'Insurance' },
  { id: C_LOCATION_RENTAL, name: 'Location Rental' },
  { id: C_MUSIC_LICENSING, name: 'Music/Licensing' },
  { id: C_OFFICE_SUPPLIES, name: 'Office Supplies' },
  { id: C_OFFICE_ADMIN, name: 'Office/Admin' },
  { id: C_OTHER, name: 'Other' },
  { id: C_POST_PRODUCTION, name: 'Post-Production' },
  { id: C_TRAVEL, name: 'Travel' },
];

const makeInvoice = (
  id: string,
  vendor: string,
  categoryId: string | null,
  projectId: string,
  total: number,
  status: 'paid' | 'unpaid' | 'overdue',
  dueDateOffset?: number,
  invoiceDateOffset: number = -30,
  currency: string = 'GBP',
): Invoice => {
  const paymentStatus = status === 'overdue' ? 'overdue' : status;
  const dueDate = dueDateOffset != null ? daysFromNow(dueDateOffset) : (status === 'paid' ? daysFromNow(-20) : daysFromNow(14));
  return {
    id,
    vendor_name: vendor,
    invoice_date: daysFromNow(invoiceDateOffset),
    invoice_number: id,
    currency,
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
    category: categoryId ? DEMO_CATEGORIES.find(c => c.id === categoryId) : undefined,
  };
};

const DEMO_INVOICES: Invoice[] = [
  // ── Shadows of the Atlantic ───────────────────────────────────────
  makeInvoice('demo-inv-ATL-001', 'Atlantic Camera Hire Ltd',    C_EQUIPMENT,        P_SHADOWS, 3840,   'paid',   0,    -61),
  makeInvoice('demo-inv-ATL-002', 'Pinewood Lighting & Grip',    C_EQUIPMENT,        P_SHADOWS, 2664,   'unpaid', -59,  -90),
  makeInvoice('demo-inv-ATL-003', 'Northern Drone Services',     C_CREW_FREELANCE,   P_SHADOWS, 1968,   'paid',   -61,  -92),
  makeInvoice('demo-inv-ATL-006', 'Location Facilities Ltd',     C_CONTRIBUTOR_FEES, P_SHADOWS, 2880,   'paid',   -6,   -56),
  makeInvoice('demo-inv-ATL-007', 'Transport Crew Vans',         C_CREW_FREELANCE,   P_SHADOWS, 780,    'paid',   -51,  -92),
  makeInvoice('demo-inv-ATL-008', 'Studio X Post Production',    C_CONTRIBUTOR_FEES, P_SHADOWS, 4392,   'paid',   -8,   -51),
  makeInvoice('demo-inv-ATL-009', 'Production Insurance Ltd',    C_INSURANCE,        P_SHADOWS, 2220,   'paid',   -63,  -95),
  makeInvoice('demo-inv-ACH-0142', 'Atlantic Camera Hire Ltd',   C_EQUIPMENT,        P_SHADOWS, 2646,   'paid',   -38,  -51),
  makeInvoice('demo-inv-SX-4472', 'Studio X Post Production',    C_POST_PRODUCTION,  P_SHADOWS, 4188,   'unpaid', -33,  -46),
  makeInvoice('demo-inv-WOS-003', 'Pinewood Lighting & Grip',    C_EQUIPMENT,        P_SHADOWS, 2688,   'unpaid', -1,   -62),

  // ── Arctic Light Documentary ──────────────────────────────────────
  makeInvoice('demo-inv-ARC-001', 'Atlantic Camera Hire Ltd',    C_EQUIPMENT,        P_ARCTIC,  5700,   'paid',   -143, -175),
  makeInvoice('demo-inv-ARC-002', 'Northern Drone Services',     C_CREW_FREELANCE,   P_ARCTIC,  2880,   'unpaid', -153, -174),
  makeInvoice('demo-inv-ARC-003', 'Pinewood Lighting & Grip',    C_EQUIPMENT,        P_ARCTIC,  2256,   'paid',   -152, -183),
  makeInvoice('demo-inv-ARC-004', 'Catering Co London',          C_CREW_FREELANCE,   P_ARCTIC,  1440,   'unpaid', -151, -182),
  makeInvoice('demo-inv-ARC-005', 'Studio X Post Production',    null,               P_ARCTIC,  6600,   'paid',   -92,  -127),
  makeInvoice('demo-inv-ARC-006', 'Location Facilities Ltd',     C_CONTRIBUTOR_FEES, P_ARCTIC,  3720,   'unpaid', -152, -179),
  makeInvoice('demo-inv-ARC-007', 'Sound Equipment Rentals',     C_EQUIPMENT,        P_ARCTIC,  864,    'unpaid', -61,  -92),
  makeInvoice('demo-inv-ARC-008', 'Transport Crew Vans',         C_CREW_FREELANCE,   P_ARCTIC,  1730.4, 'paid',   -152, -183),
  makeInvoice('demo-inv-ARC-009', 'Production Insurance Ltd',    C_OTHER,            P_ARCTIC,  2640,   'paid',   -157, -188),
  makeInvoice('demo-inv-ARC-010', 'FCO - Freelance Camera Operator', C_CREW_FREELANCE, P_ARCTIC, 2160, 'paid',   -56,  -87),

  // ── Wild Ocean Series ─────────────────────────────────────────────
  makeInvoice('demo-inv-WOS-001', 'Atlantic Camera Hire Ltd',    null,               P_OCEAN,   6552,   'paid',   -2,   -63),
  makeInvoice('demo-inv-WOS-002', 'Northern Drone Services',     C_CREW_FREELANCE,   P_OCEAN,   2160,   'paid',   0,    -61),
  makeInvoice('demo-inv-WOS-004', 'Catering Co London',          C_CONTRIBUTOR_FEES, P_OCEAN,   1180.8, 'unpaid', 5,    -31),
  makeInvoice('demo-inv-WOS-006', 'Location Facilities Ltd',     null,               P_OCEAN,   2400,   'unpaid', -5,   -64),
  makeInvoice('demo-inv-WOS-007', 'Sound Equipment Rentals',     C_EQUIPMENT,        P_OCEAN,   648,    'unpaid', -37,  -108),
  makeInvoice('demo-inv-WOS-008', 'Transport Crew Vans',         C_CREW_FREELANCE,   P_OCEAN,   1584,   'paid',   -38,  -67),
  makeInvoice('demo-inv-WOS-009', 'Production Insurance Ltd',    C_INSURANCE,        P_OCEAN,   3360,   'unpaid', -7,   -69),
  makeInvoice('demo-inv-WOS-010', 'Freelance Camera Operator',   C_EQUIPMENT,        P_OCEAN,   3840,   'paid',   -4,   -63),
  makeInvoice('demo-inv-JM-001',  'John McGee',                  C_INSURANCE,        P_OCEAN,   1000,   'paid',   23,   -27,  'EUR'),
];

const DEMO_PROJECT_CATEGORIES = [
  // Wild Ocean Series — category budget mode
  { id: 'demo-pc-1',  project_id: P_OCEAN,   category_id: C_EQUIPMENT,        budget: 20000, created_at: '' },
  { id: 'demo-pc-2',  project_id: P_OCEAN,   category_id: C_POST_PRODUCTION,  budget: 16000, created_at: '' },
  { id: 'demo-pc-3',  project_id: P_OCEAN,   category_id: C_CREW_FREELANCE,   budget: 10000, created_at: '' },
  { id: 'demo-pc-4',  project_id: P_OCEAN,   category_id: C_MUSIC_LICENSING,  budget: 7000,  created_at: '' },
  { id: 'demo-pc-5',  project_id: P_OCEAN,   category_id: C_CONTRIBUTOR_FEES, budget: 3000,  created_at: '' },
  // Shadows of the Atlantic — total budget mode (category budgets still tracked)
  { id: 'demo-pc-6',  project_id: P_SHADOWS, category_id: C_OFFICE_SUPPLIES,  budget: 0,     created_at: '' },
  { id: 'demo-pc-7',  project_id: P_SHADOWS, category_id: C_OFFICE_ADMIN,     budget: 0,     created_at: '' },
  { id: 'demo-pc-8',  project_id: P_SHADOWS, category_id: C_POST_PRODUCTION,  budget: 15000, created_at: '' },
  { id: 'demo-pc-9',  project_id: P_SHADOWS, category_id: C_INSURANCE,        budget: 5000,  created_at: '' },
  { id: 'demo-pc-10', project_id: P_SHADOWS, category_id: C_CREW_FREELANCE,   budget: 3000,  created_at: '' },
  { id: 'demo-pc-11', project_id: P_SHADOWS, category_id: C_LOCATION_RENTAL,  budget: 0,     created_at: '' },
  { id: 'demo-pc-12', project_id: P_SHADOWS, category_id: C_EQUIPMENT,        budget: 16000, created_at: '' },
  { id: 'demo-pc-13', project_id: P_SHADOWS, category_id: C_MUSIC_LICENSING,  budget: 0,     created_at: '' },
  { id: 'demo-pc-14', project_id: P_SHADOWS, category_id: C_ACCOMMODATION,    budget: 0,     created_at: '' },
  { id: 'demo-pc-15', project_id: P_SHADOWS, category_id: C_TRAVEL,           budget: 0,     created_at: '' },
  { id: 'demo-pc-16', project_id: P_SHADOWS, category_id: C_OTHER,            budget: 0,     created_at: '' },
];

type ProjectCategory = typeof DEMO_PROJECT_CATEGORIES[number];

// ── Persistence helpers ────────────────────────────────────────────────────────

const SS = {
  flag:       'bert_demo',
  projects:   'bert_demo_projects',
  invoices:   'bert_demo_invoices',
  categories: 'bert_demo_categories',
  projCats:   'bert_demo_project_categories',
  docs:       'bert_demo_docs',
  currency:   'bert_demo_currency',
};

function ssGet<T>(key: string, fallback: T): T {
  try {
    const v = sessionStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}

function ssSet(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function ssClearDemo() {
  Object.values(SS).forEach(k => sessionStorage.removeItem(k));
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Stored on disk as base64; converted to blob URL in memory
interface StoredDoc {
  id: string;
  project_id: string;
  file_name: string;
  base64: string;
  mimeType: string;
}

interface DemoDoc {
  id: string;
  project_id: string;
  file_name: string;
  signedUrl: string;
}

function storedDocToDemoDoc(sd: StoredDoc): DemoDoc {
  try {
    const [header, data] = sd.base64.split(',');
    const mimeType = header?.match(/:(.*?);/)?.[1] ?? sd.mimeType;
    const byteString = atob(data ?? sd.base64);
    const arr = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) arr[i] = byteString.charCodeAt(i);
    const blob = new Blob([arr], { type: mimeType });
    return { id: sd.id, project_id: sd.project_id, file_name: sd.file_name, signedUrl: URL.createObjectURL(blob) };
  } catch {
    return { id: sd.id, project_id: sd.project_id, file_name: sd.file_name, signedUrl: '' };
  }
}

// ── Context type ───────────────────────────────────────────────────────────────

interface DemoDataContextType {
  isDemoMode: boolean;
  demoProjects: Project[];
  demoInvoices: Invoice[];
  demoCategories: Category[];
  demoProjectCategories: ProjectCategory[];
  demoProjectDocs: DemoDoc[];
  demoCurrency: string;
  setDemoCurrency: (c: string) => void;
  updateDemoInvoice: (id: string, changes: Partial<Invoice>) => void;
  deleteDemoInvoice: (id: string) => void;
  updateDemoProject: (id: string, changes: Partial<Project>) => void;
  deleteDemoProject: (id: string) => void;
  addDemoProject: (project: Project) => void;
  addDemoProjectCategories: (entries: Omit<ProjectCategory, 'id' | 'created_at'>[]) => void;
  addDemoCategory: (name: string) => Category;
  addDemoProjectDocs: (projectId: string, files: File[]) => Promise<void>;
  addDemoInvoice: (invoice: Invoice) => void;
  startDemo: () => void;
  stopDemo: () => void;
}

const DemoDataContext = createContext<DemoDataContextType | null>(null);

export const useDemoData = () => {
  const ctx = useContext(DemoDataContext);
  if (!ctx) throw new Error('useDemoData must be used within DemoDataProvider');
  return ctx;
};

// ── Provider ───────────────────────────────────────────────────────────────────

export const DemoDataProvider = ({ children }: { children: React.ReactNode }) => {
  const isDemo = sessionStorage.getItem(SS.flag) === '1';

  const [isDemoMode, setIsDemoMode] = useState(isDemo);

  const [demoCurrencyState, setDemoCurrencyState] = useState<string>(
    isDemo ? ssGet(SS.currency, 'EUR') : 'EUR'
  );
  const [demoInvoices, setDemoInvoicesState] = useState<Invoice[]>(
    isDemo ? ssGet(SS.invoices, DEMO_INVOICES) : DEMO_INVOICES
  );
  const [demoProjects, setDemoProjectsState] = useState<Project[]>(
    isDemo ? ssGet(SS.projects, DEMO_PROJECTS) : DEMO_PROJECTS
  );
  const [demoProjectCategories, setDemoProjectCategoriesState] = useState<ProjectCategory[]>(
    isDemo ? ssGet(SS.projCats, DEMO_PROJECT_CATEGORIES) : DEMO_PROJECT_CATEGORIES
  );
  const [demoCategories, setDemoCategoriesState] = useState<Category[]>(
    isDemo ? ssGet(SS.categories, DEMO_CATEGORIES) : DEMO_CATEGORIES
  );
  const [demoProjectDocs, setDemoProjectDocsState] = useState<DemoDoc[]>(() => {
    if (!isDemo) return [];
    return ssGet<StoredDoc[]>(SS.docs, []).map(storedDocToDemoDoc);
  });

  // Setters that also write through to sessionStorage
  const setDemoCurrency = useCallback((c: string) => {
    ssSet(SS.currency, c);
    setDemoCurrencyState(c);
  }, []);

  const setDemoInvoices = useCallback((updater: (prev: Invoice[]) => Invoice[]) => {
    setDemoInvoicesState(prev => {
      const next = updater(prev);
      ssSet(SS.invoices, next);
      return next;
    });
  }, []);

  const setDemoProjects = useCallback((updater: (prev: Project[]) => Project[]) => {
    setDemoProjectsState(prev => {
      const next = updater(prev);
      ssSet(SS.projects, next);
      return next;
    });
  }, []);

  const setDemoProjectCategories = useCallback((updater: (prev: ProjectCategory[]) => ProjectCategory[]) => {
    setDemoProjectCategoriesState(prev => {
      const next = updater(prev);
      ssSet(SS.projCats, next);
      return next;
    });
  }, []);

  const setDemoCategories = useCallback((updater: (prev: Category[]) => Category[]) => {
    setDemoCategoriesState(prev => {
      const next = updater(prev);
      ssSet(SS.categories, next);
      return next;
    });
  }, []);

  // ── Demo lifecycle ─────────────────────────────────────────────────

  const startDemo = useCallback(() => {
    sessionStorage.setItem(SS.flag, '1');
    setIsDemoMode(true);
  }, []);

  const stopDemo = useCallback(() => {
    ssClearDemo();
    setIsDemoMode(false);
    setDemoCurrencyState('EUR');
    setDemoInvoicesState(DEMO_INVOICES);
    setDemoProjectsState(DEMO_PROJECTS);
    setDemoProjectCategoriesState(DEMO_PROJECT_CATEGORIES);
    setDemoCategoriesState(DEMO_CATEGORIES);
    setDemoProjectDocsState([]);
  }, []);

  // ── Invoice operations ─────────────────────────────────────────────

  const updateDemoInvoice = useCallback((id: string, changes: Partial<Invoice>) => {
    setDemoInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, ...changes } : inv));
  }, [setDemoInvoices]);

  const deleteDemoInvoice = useCallback((id: string) => {
    setDemoInvoices(prev => prev.filter(inv => inv.id !== id));
  }, [setDemoInvoices]);

  // ── Project operations ─────────────────────────────────────────────

  const updateDemoProject = useCallback((id: string, changes: Partial<Project>) => {
    setDemoProjects(prev => prev.map(proj => proj.id === id ? { ...proj, ...changes } : proj));
  }, [setDemoProjects]);

  const deleteDemoProject = useCallback((id: string) => {
    setDemoProjects(prev => prev.filter(proj => proj.id !== id));
  }, [setDemoProjects]);

  const addDemoProject = useCallback((project: Project) => {
    setDemoProjects(prev => [project, ...prev]);
  }, [setDemoProjects]);

  // ── Category operations ────────────────────────────────────────────

  const addDemoProjectCategories = useCallback((entries: Omit<ProjectCategory, 'id' | 'created_at'>[]) => {
    const newEntries = entries.map((e, i) => ({ ...e, id: `demo-pc-${Date.now()}-${i}`, created_at: '' }));
    setDemoProjectCategories(prev => [...prev, ...newEntries]);
  }, [setDemoProjectCategories]);

  const addDemoCategory = useCallback((name: string): Category => {
    const cat: Category = { id: `demo-cat-${Date.now()}`, name };
    setDemoCategories(prev => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
    return cat;
  }, [setDemoCategories]);

  // ── Document operations ────────────────────────────────────────────

  const addDemoInvoice = useCallback((invoice: Invoice) => {
    setDemoInvoices(prev => [invoice, ...prev]);
  }, [setDemoInvoices]);

  const addDemoProjectDocs = useCallback(async (projectId: string, files: File[]) => {
    const stored: StoredDoc[] = [];
    const demoDocs: DemoDoc[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const id = `demo-doc-${Date.now()}-${i}`;
      const base64 = await fileToBase64(f);
      stored.push({ id, project_id: projectId, file_name: f.name, base64, mimeType: f.type });
      demoDocs.push({ id, project_id: projectId, file_name: f.name, signedUrl: URL.createObjectURL(f) });
    }

    // Persist stored docs (base64) separately, since blob URLs can't be serialised
    const existingStored = ssGet<StoredDoc[]>(SS.docs, []);
    ssSet(SS.docs, [...existingStored, ...stored]);

    setDemoProjectDocsState(prev => [...prev, ...demoDocs]);
  }, []);

  // ── Value ──────────────────────────────────────────────────────────

  const value = useMemo(() => ({
    isDemoMode,
    demoProjects,
    demoInvoices,
    demoCategories,
    demoProjectCategories,
    demoProjectDocs,
    demoCurrency: demoCurrencyState,
    setDemoCurrency,
    updateDemoInvoice,
    deleteDemoInvoice,
    updateDemoProject,
    deleteDemoProject,
    addDemoProject,
    addDemoProjectCategories,
    addDemoCategory,
    addDemoProjectDocs,
    addDemoInvoice,
    startDemo,
    stopDemo,
  }), [isDemoMode, demoProjects, demoInvoices, demoProjectCategories, demoCategories, demoProjectDocs, demoCurrencyState, setDemoCurrency, updateDemoInvoice, deleteDemoInvoice, updateDemoProject, deleteDemoProject, addDemoProject, addDemoProjectCategories, addDemoCategory, addDemoProjectDocs, addDemoInvoice, startDemo, stopDemo]);

  return (
    <DemoDataContext.Provider value={value}>
      {children}
    </DemoDataContext.Provider>
  );
};
