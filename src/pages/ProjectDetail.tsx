import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Project, Invoice, Category } from '@/types/database';
import { Navbar } from '@/components/Navbar';
import { KpiCard } from '@/components/KpiCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, DollarSign, Target, AlertCircle, ArrowLeft } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const COLORS = ['hsl(0,100%,65%)', 'hsl(0,0%,20%)', 'hsl(0,0%,45%)', 'hsl(0,0%,70%)', 'hsl(0,0%,85%)', 'hsl(38,92%,50%)'];

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('invoices').select('*, category:categories(*)').eq('project_id', id),
      supabase.from('categories').select('*'),
    ]).then(([p, i, c]) => {
      setProject(p.data);
      setInvoices(i.data ?? []);
      setCategories(c.data ?? []);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="min-h-screen"><Navbar /><div className="container py-8"><div className="h-40 animate-pulse rounded-lg bg-secondary" /></div></div>;
  if (!project) return <div className="min-h-screen"><Navbar /><div className="container py-16 text-center text-muted-foreground">Project not found</div></div>;

  const totalSpent = invoices.reduce((s, i) => s + i.total, 0);
  const remaining = project.budget - totalSpent;
  const pct = project.budget > 0 ? Math.min((totalSpent / project.budget) * 100, 100) : 0;

  const catSpend = categories.map((c) => ({
    name: c.name,
    value: invoices.filter((i) => i.category_id === c.id).reduce((s, i) => s + i.total, 0),
  })).filter((c) => c.value > 0);

  const vendorSpend: Record<string, number> = {};
  invoices.forEach((i) => { vendorSpend[i.vendor_name] = (vendorSpend[i.vendor_name] ?? 0) + i.total; });
  const vendorData = Object.entries(vendorSpend).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const monthlyMap: Record<string, number> = {};
  invoices.forEach((i) => { const m = i.invoice_date?.slice(0, 7) ?? 'N/A'; monthlyMap[m] = (monthlyMap[m] ?? 0) + i.total; });
  const monthlyData = Object.entries(monthlyMap).sort().map(([month, value]) => ({ month, value }));

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container space-y-8 py-8">
        <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Projects</Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <StatusBadge status={project.status} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Invoices" value={invoices.length} icon={<FileText className="h-5 w-5 text-primary" />} />
          <KpiCard title="Total Spent" value={`€${totalSpent.toLocaleString()}`} icon={<DollarSign className="h-5 w-5 text-primary" />} />
          <KpiCard title="Budget" value={`€${project.budget.toLocaleString()}`} icon={<Target className="h-5 w-5 text-muted-foreground" />} />
          <KpiCard title="Remaining" value={`€${remaining.toLocaleString()}`} icon={<AlertCircle className={`h-5 w-5 ${remaining < 0 ? 'text-primary' : 'text-muted-foreground'}`} />} />
        </div>

        {remaining < 0 && (
          <div className="rounded-lg border border-primary bg-primary/5 p-4 text-sm font-medium text-primary">⚠ Over budget by €{Math.abs(remaining).toLocaleString()}</div>
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
        <Card>
          <CardHeader><CardTitle className="text-sm">Invoices</CardTitle></CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No invoices for this project yet.</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Vendor</th><th className="pb-2 pr-4">Date</th><th className="pb-2 pr-4">Invoice #</th>
                    <th className="pb-2 pr-4">Total</th><th className="pb-2 pr-4">Category</th><th className="pb-2">Status</th>
                  </tr></thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b last:border-0 hover:bg-secondary/50">
                        <td className="py-2 pr-4"><Link to={`/invoices/${inv.id}`} className="font-medium hover:text-primary">{inv.vendor_name}</Link></td>
                        <td className="py-2 pr-4">{inv.invoice_date}</td>
                        <td className="py-2 pr-4">{inv.invoice_number}</td>
                        <td className="py-2 pr-4">{inv.currency}{inv.total.toLocaleString()}</td>
                        <td className="py-2 pr-4">{(inv as any).category?.name ?? '—'}</td>
                        <td className="py-2"><StatusBadge status={inv.payment_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProjectDetail;
