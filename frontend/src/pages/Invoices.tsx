import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Invoice, Project, Category } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { StatusDropdown } from '@/components/StatusDropdown';
import { ImportModal } from '@/components/ImportModal';
import { CreateInvoiceDialog } from '@/components/CreateInvoiceDialog';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/hooks/use-toast';
import { Search, Download, ChevronLeft, ChevronRight, FileText, Archive, Upload, AlertCircle, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { formatCurrency, convertToBase } from '@/lib/currency';
import { useDemoData } from '@/contexts/DemoDataContext';

const PAGE_SIZE = 25;

const Invoices = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [rawInvoices, setRawInvoices] = useState<Invoice[]>([]);
  const [rawProjects, setRawProjects] = useState<Project[]>([]);
  const [rawCategories, setRawCategories] = useState<Category[]>([]);
  const [projectCategories, setProjectCategories] = useState<{ project_id: string; category_id: string }[]>([]);
  const { isDemoMode, demoInvoices, demoProjects, demoCategories, updateDemoInvoice } = useDemoData();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterProjectScope, setFilterProjectScope] = useState<'active' | 'all' | 'archived'>(() => {
    const scope = new URLSearchParams(window.location.search).get('scope');
    return (scope === 'all' || scope === 'archived') ? scope : 'active';
  });
  const [quickFilter, setQuickFilter] = useState<'all' | 'paid' | 'unpaid' | 'overdue'>(() => {
    const status = new URLSearchParams(window.location.search).get('status');
    if (status === 'overdue' || status === 'unpaid') return status;
    return 'all';
  });
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(0);
  const { baseCurrency } = useUserSettings();
  const { rates } = useExchangeRates(baseCurrency);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    const scope = params.get('scope');
    if (status === 'overdue' || status === 'unpaid') {
      setQuickFilter(status);
      setPage(0);
    }
    if (scope === 'all' || scope === 'archived') {
      setFilterProjectScope(scope);
    }
  }, [location.search]);

  const fetchData = useCallback(async () => {
    const [i, p, c, pc] = await Promise.all([
      supabase.from('invoices').select('*').order('invoice_date', { ascending: false }),
      supabase.from('projects').select('*'),
      supabase.from('invoice_categories').select('*'),
      supabase.from('project_categories').select('project_id, category_id'),
    ]);

    const projectsMap = new Map((p.data ?? []).map((proj: any) => [proj.id, proj]));
    const categoriesMap = new Map((c.data ?? []).map((cat: any) => [cat.id, cat]));

    const today = new Date().toISOString().split('T')[0];
    const enriched = (i.data ?? []).map((inv: any) => {
      let status = inv.payment_status;
      if (status === 'unpaid' && inv.due_date && inv.due_date < today) {
        status = 'overdue';
      }
      return {
        ...inv,
        payment_status: status,
        project: inv.project_id ? projectsMap.get(inv.project_id) ?? null : null,
        category: inv.category_id ? categoriesMap.get(inv.category_id) ?? null : null,
      };
    });

    setRawInvoices(enriched);
    setRawProjects(p.data ?? []);
    setRawCategories(c.data ?? []);
    setProjectCategories(pc.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const invoices = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const enrich = (inv: any) => inv.payment_status === 'unpaid' && inv.due_date && inv.due_date < today
      ? { ...inv, payment_status: 'overdue' }
      : inv;
    const all = isDemoMode ? [...demoInvoices, ...rawInvoices] : rawInvoices;
    return all.map(enrich);
  }, [isDemoMode, demoInvoices, rawInvoices]);
  const projects = useMemo(() => isDemoMode ? [...demoProjects, ...rawProjects] : rawProjects, [isDemoMode, demoProjects, rawProjects]);
  const categories = useMemo(() => isDemoMode ? [...demoCategories, ...rawCategories] : rawCategories, [isDemoMode, demoCategories, rawCategories]);

  
  const archivedProjects = useMemo(() => projects.filter(p => p.status === 'Completed'), [projects]);
  const archivedProjectIds = useMemo(() => new Set(archivedProjects.map(p => p.id)), [archivedProjects]);

  const filtered = useMemo(() => {
    let result = [...invoices];

    // Quick filter
    if (quickFilter === 'unpaid') {
      result = result.filter((i) => i.payment_status === 'unpaid' || i.payment_status === 'overdue');
    } else if (quickFilter === 'overdue') {
      result = result.filter((i) => i.payment_status === 'overdue');
    } else if (quickFilter === 'paid') {
      result = result.filter((i) => i.payment_status === 'paid');
    }

    // Project scope filter
    if (filterProjectScope === 'active') {
      result = result.filter((i) => !i.project_id || !archivedProjectIds.has(i.project_id));
    } else if (filterProjectScope === 'archived') {
      result = result.filter((i) => i.project_id && archivedProjectIds.has(i.project_id));
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.vendor_name?.toLowerCase().includes(q) || i.invoice_number?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    }
    if (filterProject !== 'all') result = result.filter((i) => i.project_id === filterProject);
    if (filterCategory !== 'all') result = result.filter((i) => i.category_id === filterCategory);
    result.sort((a, b) => {
      if (sort === 'newest') return (b.invoice_date ?? '').localeCompare(a.invoice_date ?? '');
      if (sort === 'oldest') return (a.invoice_date ?? '').localeCompare(b.invoice_date ?? '');
      return (b.total ?? 0) - (a.total ?? 0);
    });
    return result;
  }, [invoices, search, filterProject, filterCategory, sort, quickFilter, filterProjectScope, archivedProjectIds]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const changeStatus = async (inv: Invoice, newStatus: string) => {
    const today = new Date().toISOString().split('T')[0];
    const effectiveStatus = newStatus === 'unpaid' && inv.due_date && inv.due_date < today ? 'overdue' : newStatus;
    if (isDemoMode && inv.id.startsWith('demo-')) {
      updateDemoInvoice(inv.id, { payment_status: effectiveStatus as any });
      toast({ title: `Marked as ${effectiveStatus}` });
      return;
    }
    const { error } = await supabase.from('invoices').update({ payment_status: effectiveStatus }).eq('id', inv.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setRawInvoices((prev) => prev.map((i) => i.id === inv.id ? { ...i, payment_status: effectiveStatus as any } : i));
    toast({ title: `Marked as ${effectiveStatus}` });
  };

  const assignProject = async (invoiceId: string, projectId: string) => {
    const proj = projects.find(p => p.id === projectId);
    if (isDemoMode && invoiceId.startsWith('demo-')) {
      updateDemoInvoice(invoiceId, { project_id: projectId, project: proj ?? null } as any);
      toast({ title: 'Project assigned' });
      return;
    }
    const { error } = await supabase.from('invoices').update({ project_id: projectId }).eq('id', invoiceId);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    const inv = rawInvoices.find(i => i.id === invoiceId);
    setRawInvoices((prev) => prev.map((i) => i.id === invoiceId ? { ...i, project_id: projectId, project: proj ?? null } as any : i));
    toast({ title: 'Project assigned' });
    // Upsert vendor mapping for future auto-assignment
    if (inv?.vendor_name) {
      supabase.from('vendor_mappings').upsert(
        { user_id: user!.id, vendor_name: inv.vendor_name, project_id: projectId, category_id: inv.category_id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,vendor_name' }
      ).then();
    }
  };

  const assignCategory = async (invoiceId: string, categoryId: string) => {
    const cat = categories.find(c => c.id === categoryId);
    if (isDemoMode && invoiceId.startsWith('demo-')) {
      updateDemoInvoice(invoiceId, { category_id: categoryId, category: cat ?? null } as any);
      toast({ title: 'Category assigned' });
      return;
    }
    const { error } = await supabase.from('invoices').update({ category_id: categoryId }).eq('id', invoiceId);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    const inv = rawInvoices.find(i => i.id === invoiceId);
    setRawInvoices((prev) => prev.map((i) => i.id === invoiceId ? { ...i, category_id: categoryId, category: cat ?? null } as any : i));
    toast({ title: 'Category assigned' });
    if (inv?.vendor_name) {
      supabase.from('vendor_mappings').upsert(
        { user_id: user!.id, vendor_name: inv.vendor_name, project_id: inv.project_id, category_id: categoryId, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,vendor_name' }
      ).then();
    }
  };

  const unassignCategory = async (invoiceId: string) => {
    if (isDemoMode && invoiceId.startsWith('demo-')) {
      updateDemoInvoice(invoiceId, { category_id: null, category: null } as any);
      toast({ title: 'Category removed' });
      return;
    }
    const { error } = await supabase.from('invoices').update({ category_id: null }).eq('id', invoiceId);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setRawInvoices((prev) => prev.map((i) => i.id === invoiceId ? { ...i, category_id: null, category: null } as any : i));
    toast({ title: 'Category removed' });
  };

  const unassignProject = async (invoiceId: string) => {
    if (isDemoMode && invoiceId.startsWith('demo-')) {
      updateDemoInvoice(invoiceId, { project_id: null, project: null } as any);
      toast({ title: 'Project removed' });
      return;
    }
    const { error } = await supabase.from('invoices').update({ project_id: null }).eq('id', invoiceId);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setRawInvoices((prev) => prev.map((i) => i.id === invoiceId ? { ...i, project_id: null, project: null } as any : i));
    toast({ title: 'Project removed' });
  };

  const exportCsv = () => {
    const headers = ['Vendor', 'Date', 'Due Date', 'Invoice #', 'Total', 'Currency', 'Category', 'Project', 'Status'];
    const rows = filtered.map((i) => [
      i.vendor_name, i.invoice_date, i.due_date ?? '', i.invoice_number, i.total, i.currency,
      (i as any).category?.name ?? '', (i as any).project?.name ?? '', i.payment_status,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'invoices.csv'; a.click();
  };

  return (
    <div className="min-h-screen">
      <div className="container space-y-6 py-8">
        <h1 className="text-2xl font-bold tracking-[-0.03em]">Invoices</h1>

        {/* Quick filter + Project scope tabs + Import/Export */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1 rounded-lg border bg-card p-1">
            {([['all', 'All'], ['paid', 'Paid'], ['unpaid', 'Unpaid'], ['overdue', 'Overdue']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setQuickFilter(key); setPage(0); }}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${quickFilter === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >{label}</button>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg border bg-card p-1">
            {([['active', 'Active Projects'], ['all', 'All'], ['archived', 'Completed']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setFilterProjectScope(key); setPage(0); }}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${filterProjectScope === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >{label}</button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              <Plus className="h-4 w-4" /> New Invoice
            </button>
            <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              <Upload className="h-4 w-4" /> Import
            </button>
            <button onClick={exportCsv} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search vendor, invoice #, description..." className="pl-9" />
          </div>
          <Select value={filterProject} onValueChange={(v) => { setFilterProject(v); setPage(0); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setPage(0); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="total_desc">Total (high)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</p>

        <div data-tour="invoices-table">
        {loading ? (
          <div className="overflow-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-card text-left text-muted-foreground">
                <th className="p-3">Vendor</th><th className="p-3">Date</th><th className="p-3">Due Date</th><th className="p-3">Invoice #</th>
                <th className="p-3">Total</th><th className="p-3">Category</th><th className="p-3">Project</th><th className="p-3">Status</th>
              </tr></thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : paged.length === 0 ? (
          <EmptyState icon={FileText} title="No invoices found" description="Connect your inbox or upload invoices to get started." />
        ) : (
          <div className="overflow-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-card text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="p-3">Vendor</th><th className="p-3">Date</th><th className="p-3">Due Date</th><th className="p-3">Invoice #</th>
                <th className="p-3">Total</th><th className="p-3">Category</th><th className="p-3">Project</th><th className="p-3">Status</th>
              </tr></thead>
              <tbody>
                {paged.map((inv) => {
                  const origCurrency = inv.currency || baseCurrency;
                  const showOriginal = origCurrency !== baseCurrency;
                  const isArchived = inv.project_id && archivedProjectIds.has(inv.project_id);
                  const projCats = inv.project_id ? projectCategories.filter(pc => pc.project_id === inv.project_id) : null;
                  const catValid = !!(inv.category_id
                    && categories.some(c => c.id === inv.category_id)
                    && (!projCats || projCats.length === 0 || projCats.some(pc => pc.category_id === inv.category_id)));
                  const unassigned = !catValid || !inv.project_id;
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                      className={`group border-b last:border-b-0 cursor-pointer transition-colors hover:bg-secondary/60 ${isArchived ? 'opacity-60' : ''} ${unassigned ? 'border-l-2 border-l-primary/60 bg-primary/[0.03]' : 'border-l-2 border-l-transparent'}`}
                    >
                      <td className="p-3 font-medium">{inv.vendor_name}</td>
                      <td className="p-3 text-muted-foreground">{inv.invoice_date}</td>
                      <td className="p-3 text-muted-foreground">{inv.due_date ?? '—'}</td>
                      <td className="p-3 text-muted-foreground">{inv.invoice_number}</td>
                      <td className="p-3">
                        <span className="font-medium">
                          {formatCurrency(convertToBase(inv.total ?? 0, origCurrency, rates), baseCurrency)}
                        </span>
                        {showOriginal && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({formatCurrency(inv.total ?? 0, origCurrency)})
                          </span>
                        )}
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <Select value={catValid ? inv.category_id! : undefined} onValueChange={(v) => v === 'unassigned' ? unassignCategory(inv.id) : assignCategory(inv.id, v)}>
                          <SelectTrigger className="h-7 w-36 text-xs border-dashed justify-between text-left">
                            <SelectValue placeholder="" />
                          </SelectTrigger>
                          <SelectContent position="popper" sideOffset={4}>
                            <SelectItem value="unassigned" className="text-muted-foreground">Unassigned</SelectItem>
                            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <Select value={inv.project_id && projects.some(p => p.id === inv.project_id) ? inv.project_id : undefined} onValueChange={(v) => v === 'unassigned' ? unassignProject(inv.id) : assignProject(inv.id, v)}>
                            <SelectTrigger className="h-7 w-36 text-xs border-dashed justify-between text-left">
                              <SelectValue placeholder="" />
                            </SelectTrigger>
                            <SelectContent position="popper" sideOffset={4}>
                              <SelectItem value="unassigned" className="text-muted-foreground">Unassigned</SelectItem>
                              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {isArchived && <Archive className="h-3 w-3 text-muted-foreground/60" />}
                        </div>
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <StatusDropdown status={inv.payment_status === 'overdue' ? 'unpaid' : inv.payment_status} onChangeStatus={(s) => changeStatus(inv, s)} />
                          {inv.payment_status === 'overdue' && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                                    <AlertCircle className="h-3 w-3" /> Overdue
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Due date has passed</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={fetchData}
      />
      <CreateInvoiceDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchData}
        projects={projects}
        categories={categories}
        defaultCurrency={baseCurrency}
      />
    </div>
  );
};

export default Invoices;
