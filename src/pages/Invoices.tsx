import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Invoice, Project, Category } from '@/types/database';
import { Navbar } from '@/components/Navbar';
import { StatusDropdown } from '@/components/StatusDropdown';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/hooks/use-toast';
import { Search, Download, ChevronLeft, ChevronRight, FileText, Archive } from 'lucide-react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { formatCurrency } from '@/lib/currency';

const PAGE_SIZE = 25;

const Invoices = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProjectScope, setFilterProjectScope] = useState<'active' | 'all' | 'archived'>('active');
  const [quickFilter, setQuickFilter] = useState<'all' | 'unpaid_overdue'>('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(0);
  const { baseCurrency } = useUserSettings();

  const fetchData = useCallback(async () => {
    const [i, p, c] = await Promise.all([
      supabase.from('invoices').select('*').order('invoice_date', { ascending: false }),
      supabase.from('projects').select('*'),
      supabase.from('invoice_categories').select('*'),
    ]);

    const projectsMap = new Map((p.data ?? []).map((proj: any) => [proj.id, proj]));
    const categoriesMap = new Map((c.data ?? []).map((cat: any) => [cat.id, cat]));

    const enriched = (i.data ?? []).map((inv: any) => ({
      ...inv,
      project: inv.project_id ? projectsMap.get(inv.project_id) ?? null : null,
      category: inv.category_id ? categoriesMap.get(inv.category_id) ?? null : null,
    }));

    setInvoices(enriched);
    setProjects(p.data ?? []);
    setCategories(c.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  
  const archivedProjects = useMemo(() => projects.filter(p => p.status === 'Completed'), [projects]);
  const archivedProjectIds = useMemo(() => new Set(archivedProjects.map(p => p.id)), [archivedProjects]);

  const filtered = useMemo(() => {
    let result = [...invoices];

    // Quick filter
    if (quickFilter === 'unpaid_overdue') {
      result = result.filter((i) => i.payment_status === 'unpaid' || i.payment_status === 'overdue');
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
    if (filterStatus !== 'all') result = result.filter((i) => i.payment_status === filterStatus);
    result.sort((a, b) => {
      if (sort === 'newest') return (b.invoice_date ?? '').localeCompare(a.invoice_date ?? '');
      if (sort === 'oldest') return (a.invoice_date ?? '').localeCompare(b.invoice_date ?? '');
      return (b.total ?? 0) - (a.total ?? 0);
    });
    return result;
  }, [invoices, search, filterProject, filterCategory, filterStatus, sort, quickFilter, filterProjectScope, archivedProjectIds]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const changeStatus = async (inv: Invoice, newStatus: string) => {
    const { error } = await supabase.from('invoices').update({ payment_status: newStatus }).eq('id', inv.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setInvoices((prev) => prev.map((i) => i.id === inv.id ? { ...i, payment_status: newStatus as any } : i));
    toast({ title: `Marked as ${newStatus}` });
  };

  const assignProject = async (invoiceId: string, projectId: string) => {
    const { error } = await supabase.from('invoices').update({ project_id: projectId }).eq('id', invoiceId);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    const proj = projects.find(p => p.id === projectId);
    setInvoices((prev) => prev.map((i) => i.id === invoiceId ? { ...i, project_id: projectId, project: proj ?? null } as any : i));
    toast({ title: 'Project assigned' });
  };

  const assignCategory = async (invoiceId: string, categoryId: string) => {
    const { error } = await supabase.from('invoices').update({ category_id: categoryId }).eq('id', invoiceId);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    const cat = categories.find(c => c.id.toString() === categoryId);
    setInvoices((prev) => prev.map((i) => i.id === invoiceId ? { ...i, category_id: categoryId, category: cat ?? null } as any : i));
    toast({ title: 'Category assigned' });
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
      <Navbar />
      <div className="container space-y-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Invoices</h1>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1 h-4 w-4" /> Export CSV</Button>
        </div>

        {/* Quick filter + Project scope tabs */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            <button
              onClick={() => { setQuickFilter('all'); setPage(0); }}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${quickFilter === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >All</button>
            <button
              onClick={() => { setQuickFilter('unpaid_overdue'); setPage(0); }}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${quickFilter === 'unpaid_overdue' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >Unpaid / Overdue</button>
          </div>
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            {([['active', 'Active Projects'], ['all', 'All'], ['archived', 'Archived']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setFilterProjectScope(key); setPage(0); }}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${filterProjectScope === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >{label}</button>
            ))}
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
              {categories.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
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

        {loading ? (
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-secondary/30 text-left text-muted-foreground">
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
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-secondary/30 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="p-3">Vendor</th><th className="p-3">Date</th><th className="p-3">Due Date</th><th className="p-3">Invoice #</th>
                <th className="p-3">Total</th><th className="p-3">Category</th><th className="p-3">Project</th><th className="p-3">Status</th>
              </tr></thead>
              <tbody>
                {paged.map((inv) => {
                  const origCurrency = inv.currency || baseCurrency;
                  const showOriginal = origCurrency !== baseCurrency;
                  const isArchived = inv.project_id && archivedProjectIds.has(inv.project_id);
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                      className={`border-b last:border-0 cursor-pointer transition-colors hover:bg-secondary/60 ${isArchived ? 'opacity-60' : ''}`}
                    >
                      <td className="p-3 font-medium">{inv.vendor_name}</td>
                      <td className="p-3 text-muted-foreground">{inv.invoice_date}</td>
                      <td className="p-3 text-muted-foreground">{inv.due_date ?? '—'}</td>
                      <td className="p-3 text-muted-foreground">{inv.invoice_number}</td>
                      <td className="p-3">
                        <span className="font-medium">{formatCurrency(inv.total ?? 0, baseCurrency)}</span>
                        {showOriginal && (
                          <span className="ml-1.5 text-xs text-muted-foreground">({origCurrency} {inv.total?.toLocaleString()})</span>
                        )}
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        {(inv as any).category?.name ? (
                          <span className="text-muted-foreground">{(inv as any).category.name}</span>
                        ) : (
                          <Select onValueChange={(v) => assignCategory(inv.id, v)}>
                            <SelectTrigger className="h-7 w-32 text-xs border-dashed"><SelectValue placeholder="Assign..." /></SelectTrigger>
                            <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        {(inv as any).project?.name ? (
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            {(inv as any).project.name}
                            {isArchived && <Archive className="h-3 w-3 text-muted-foreground/60" />}
                          </span>
                        ) : (
                          <Select onValueChange={(v) => assignProject(inv.id, v)}>
                            <SelectTrigger className="h-7 w-32 text-xs border-dashed"><SelectValue placeholder="Assign..." /></SelectTrigger>
                            <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <StatusDropdown status={inv.payment_status} onChangeStatus={(s) => changeStatus(inv, s)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Invoices;
