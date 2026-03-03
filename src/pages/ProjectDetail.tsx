import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Project, Invoice, Category } from '@/types/database';
import { Navbar } from '@/components/Navbar';
import { KpiCard } from '@/components/KpiCard';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusDropdown } from '@/components/StatusDropdown';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';
import { useUserSettings } from '@/hooks/useUserSettings';
import { formatCurrency, convertToBase } from '@/lib/currency';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { FileText, DollarSign, Target, AlertCircle, ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { ProjectEditDialog } from '@/components/ProjectEditDialog';

const COLORS = ['hsl(0,100%,65%)', 'hsl(0,0%,20%)', 'hsl(0,0%,45%)', 'hsl(0,0%,70%)', 'hsl(0,0%,85%)', 'hsl(38,92%,50%)'];

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { baseCurrency } = useUserSettings();
  const { rates } = useExchangeRates(baseCurrency);
  const [project, setProject] = useState<Project | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const fetchData = () => {
    if (!id) return;
    Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('invoices').select('*, category:invoice_categories(*)').eq('project_id', id),
      supabase.from('invoice_categories').select('*'),
    ]).then(([p, i, c]) => {
      setProject(p.data);
      const today = new Date().toISOString().split('T')[0];
      const enriched = (i.data ?? []).map((inv: any) => {
        let status = inv.payment_status;
        if (status === 'unpaid' && inv.due_date && inv.due_date < today) status = 'overdue';
        return { ...inv, payment_status: status };
      });
      setInvoices(enriched);
      setCategories(c.data ?? []);
      setLoading(false);
    });
  };

  useEffect(() => { fetchData(); }, [id]);

  const assignCategory = async (invoiceId: string, categoryId: string) => {
    const { error } = await supabase.from('invoices').update({ category_id: categoryId }).eq('id', invoiceId);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    const cat = categories.find(c => c.id === categoryId);
    setInvoices((prev) => prev.map((i) => i.id === invoiceId ? { ...i, category_id: categoryId, category: cat ?? null } as any : i));
    toast({ title: 'Category assigned' });
  };

  const changeInvoiceStatus = async (inv: Invoice, newStatus: string) => {
    const { error } = await supabase.from('invoices').update({ payment_status: newStatus }).eq('id', inv.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setInvoices((prev) => prev.map((i) => i.id === inv.id ? { ...i, payment_status: newStatus as any } : i));
    toast({ title: `Marked as ${newStatus}` });
  };


  const handleDelete = async () => {
    if (!id) return;
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Project deleted' });
    navigate('/projects');
  };

  if (loading) return <div className="min-h-screen"><Navbar /><div className="container py-8"><div className="h-40 animate-pulse rounded-lg bg-secondary" /></div></div>;
  if (!project) return <div className="min-h-screen"><Navbar /><div className="container py-16 text-center text-muted-foreground">Project not found</div></div>;

  const totalSpent = invoices.reduce((s, i) => s + convertToBase(i.total ?? 0, i.currency ?? baseCurrency, rates), 0);
  const remaining = project.budget - totalSpent;
  const pct = project.budget > 0 ? Math.min((totalSpent / project.budget) * 100, 100) : 0;

  const catSpend = categories.map((c) => ({
    name: c.name,
    value: invoices.filter((i) => i.category_id === c.id).reduce((s, i) => s + convertToBase(i.total ?? 0, i.currency ?? baseCurrency, rates), 0),
  })).filter((c) => c.value > 0);

  const vendorSpend: Record<string, number> = {};
  invoices.forEach((i) => { const v = i.vendor_name ?? 'Unknown'; vendorSpend[v] = (vendorSpend[v] ?? 0) + convertToBase(i.total ?? 0, i.currency ?? baseCurrency, rates); });
  const vendorData = Object.entries(vendorSpend).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const monthlyMap: Record<string, number> = {};
  invoices.forEach((i) => { const m = i.invoice_date?.slice(0, 7) ?? 'N/A'; monthlyMap[m] = (monthlyMap[m] ?? 0) + convertToBase(i.total ?? 0, i.currency ?? baseCurrency, rates); });
  const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthlyData = Object.entries(monthlyMap).sort().map(([month, value]) => {
    const [y, m] = month.split('-');
    const label = m ? `${SHORT_MONTHS[parseInt(m, 10) - 1]} ${y.slice(2)}` : month;
    return { month: label, value };
  });

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container space-y-8 py-8">
        <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Projects</Link>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold truncate max-w-md lg:max-w-xl">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => setShowEditDialog(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ProjectEditDialog
          project={project}
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          onSaved={fetchData}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Invoices" value={invoices.length} icon={<FileText className="h-5 w-5 text-primary" />} />
          <KpiCard title="Total Spent" value={formatCurrency(totalSpent, baseCurrency)} icon={<DollarSign className="h-5 w-5 text-primary" />} />
          <KpiCard title="Budget" value={formatCurrency(project.budget, baseCurrency)} icon={<Target className="h-5 w-5 text-muted-foreground" />} />
          <KpiCard title="Remaining" value={formatCurrency(remaining, baseCurrency)} icon={<AlertCircle className={`h-5 w-5 ${remaining < 0 ? 'text-primary' : 'text-muted-foreground'}`} />} />
        </div>

        {remaining < 0 && (
          <div className="rounded-lg border border-primary bg-primary/5 p-4 text-sm font-medium text-primary">Over budget by {formatCurrency(Math.abs(remaining), baseCurrency)}</div>
        )}

        <Progress value={pct} className="h-3" />

        <div className="grid gap-6 lg:grid-cols-3">
          {catSpend.length > 0 && (
            <Card><CardHeader><CardTitle className="text-sm">By Category</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={catSpend} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>{catSpend.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            </CardContent></Card>
          )}
          {vendorData.length > 0 && (
            <Card><CardHeader><CardTitle className="text-sm">By Vendor</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={vendorData} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tick={{ fontSize: 10 }} /><YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="value" fill="hsl(0,100%,65%)" radius={[0, 4, 4, 0]} /></BarChart>
              </ResponsiveContainer>
            </CardContent></Card>
          )}
          {monthlyData.length > 0 && (
            <Card><CardHeader><CardTitle className="text-sm">Monthly Spend</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthlyData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Line type="monotone" dataKey="value" stroke="hsl(0,100%,65%)" strokeWidth={2} /></LineChart>
              </ResponsiveContainer>
            </CardContent></Card>
          )}
        </div>

        {/* Invoice table */}
        <div className="overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-secondary/30 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="p-3">Vendor</th><th className="p-3">Date</th><th className="p-3">Due Date</th><th className="p-3">Invoice #</th>
              <th className="p-3">Total</th><th className="p-3">Category</th><th className="p-3">Status</th>
            </tr></thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No invoices for this project yet.</td></tr>
              ) : invoices.map((inv) => {
                const unassigned = !inv.category_id;
                return (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className={`group border-b last:border-0 cursor-pointer transition-colors hover:bg-secondary/60 ${unassigned ? 'outline outline-1 -outline-offset-1 outline-primary/50 bg-primary/[0.03]' : ''}`}
                  >
                    <td className="p-3 font-medium">{inv.vendor_name ?? 'Unknown'}</td>
                    <td className="p-3 text-muted-foreground">{inv.invoice_date ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">{inv.due_date ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">{inv.invoice_number ?? '—'}</td>
                    <td className="p-3">
                      <span className="font-medium">{formatCurrency(convertToBase(inv.total ?? 0, inv.currency ?? baseCurrency, rates), baseCurrency)}</span>
                      {inv.currency && inv.currency !== baseCurrency && (
                        <span className="ml-1 text-xs text-muted-foreground">({formatCurrency(inv.total ?? 0, inv.currency)})</span>
                      )}
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <Select value={inv.category_id ?? ''} onValueChange={(v) => assignCategory(inv.id, v)}>
                        <SelectTrigger className="h-7 w-36 text-xs border-dashed justify-between text-left">
                          <SelectValue placeholder="Assign" />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4}>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <StatusDropdown status={inv.payment_status === 'overdue' ? 'unpaid' : inv.payment_status} onChangeStatus={(s) => changeInvoiceStatus(inv, s)} />
                        {inv.payment_status === 'overdue' && (
                          <TooltipProvider>
                            <UiTooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                                  <AlertCircle className="h-3 w-3" /> Overdue
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Due date has passed</TooltipContent>
                            </UiTooltip>
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
        {/* Delete confirm dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete project?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This action cannot be undone. All invoices will be unassigned.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ProjectDetail;
