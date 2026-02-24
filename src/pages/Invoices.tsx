import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Invoice, Project, Category } from '@/types/database';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 25;

const Invoices = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(0);

  useEffect(() => {
    Promise.all([
      supabase.from('invoices').select('*, project:projects(*), category:categories(*)').order('invoice_date', { ascending: false }),
      supabase.from('projects').select('*'),
      supabase.from('categories').select('*'),
    ]).then(([i, p, c]) => {
      setInvoices(i.data ?? []);
      setProjects(p.data ?? []);
      setCategories(c.data ?? []);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    let result = [...invoices];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.vendor_name?.toLowerCase().includes(q) || i.invoice_number?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    }
    if (filterProject !== 'all') result = result.filter((i) => i.project_id === filterProject);
    if (filterCategory !== 'all') result = result.filter((i) => i.category_id === parseInt(filterCategory));
    if (filterStatus !== 'all') result = result.filter((i) => i.payment_status === filterStatus);
    result.sort((a, b) => {
      if (sort === 'newest') return (b.invoice_date ?? '').localeCompare(a.invoice_date ?? '');
      if (sort === 'oldest') return (a.invoice_date ?? '').localeCompare(b.invoice_date ?? '');
      return b.total - a.total;
    });
    return result;
  }, [invoices, search, filterProject, filterCategory, filterStatus, sort]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const toggleStatus = async (inv: Invoice) => {
    const newStatus = inv.payment_status === 'paid' ? 'unpaid' : 'paid';
    const { error } = await supabase.from('invoices').update({ payment_status: newStatus }).eq('id', inv.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setInvoices((prev) => prev.map((i) => i.id === inv.id ? { ...i, payment_status: newStatus } : i));
  };

  const exportCsv = () => {
    const headers = ['Vendor', 'Date', 'Invoice #', 'Total', 'Currency', 'Category', 'Project', 'Status'];
    const rows = filtered.map((i) => [
      i.vendor_name, i.invoice_date, i.invoice_number, i.total, i.currency,
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
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-secondary" />)}</div>
        ) : paged.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">No invoices found.</div>
        ) : (
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-secondary/30 text-left text-muted-foreground">
                <th className="p-3">Vendor</th><th className="p-3">Date</th><th className="p-3">Invoice #</th>
                <th className="p-3">Total</th><th className="p-3">Category</th><th className="p-3">Project</th><th className="p-3">Status</th>
              </tr></thead>
              <tbody>
                {paged.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0 cursor-pointer hover:bg-secondary/50">
                    <td className="p-3"><Link to={`/invoices/${inv.id}`} className="font-medium hover:text-primary">{inv.vendor_name}</Link></td>
                    <td className="p-3">{inv.invoice_date}</td>
                    <td className="p-3">{inv.invoice_number}</td>
                    <td className="p-3">{inv.currency}{inv.total?.toLocaleString()}</td>
                    <td className="p-3">{(inv as any).category?.name ?? '—'}</td>
                    <td className="p-3">{(inv as any).project?.name ?? '—'}</td>
                    <td className="p-3">
                      <button onClick={() => toggleStatus(inv)}><StatusBadge status={inv.payment_status} /></button>
                    </td>
                  </tr>
                ))}
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
