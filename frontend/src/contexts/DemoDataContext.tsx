import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Invoice, Project, Category } from '@/types/database';

// Helper: date relative to today
const daysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

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
    startDemo,
    stopDemo,
  }), [isDemoMode, demoProjects, demoInvoices, demoProjectCategories, demoCategories, demoProjectDocs, demoCurrencyState, setDemoCurrency, updateDemoInvoice, deleteDemoInvoice, updateDemoProject, deleteDemoProject, addDemoProject, addDemoProjectCategories, addDemoCategory, addDemoProjectDocs, startDemo, stopDemo]);

  return (
    <DemoDataContext.Provider value={value}>
      {children}
    </DemoDataContext.Provider>
  );
};
