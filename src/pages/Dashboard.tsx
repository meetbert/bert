import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Invoice, Project, Category } from '@/types/database';
import { Navbar } from '@/components/Navbar';
import { KpiCard } from '@/components/KpiCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { FileText, DollarSign, FolderOpen, AlertCircle, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const CHART_COLORS = ['hsl(0,100%,65%)', 'hsl(0,0%,20%)', 'hsl(0,0%,45%)', 'hsl(0,0%,70%)', 'hsl(0,0%,85%)', 'hsl(38,92%,50%)', 'hsl(142,71%,45%)'];

const Dashboard = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [invRes, projRes, catRes] = await Promise.all([
      supabase.from('invoices').select('*, project:projects(*), category:categories(*)'),
      supabase.from('projects').select('*'),
      supabase.from('categories').select('*'),
    ]);
    setInvoices(invRes.data ?? []);
    setProjects(projRes.data ?? []);
    setCategories(catRes.data ?? []);
    setLoading(false);
  };

  const totalSpend = invoices.reduce((s, i) => s + (i.total ?? 0), 0);
  const activeProjects = projects.filter((p) => p.status === 'Active');
  const unpaid = invoices.filter((i) => i.payment_status === 'unpaid');
  const overdue = invoices.filter((i) => i.payment_status === 'overdue');
  const unassigned = invoices.filter((i) => !i.project_id);

  // Spend by category
  const categorySpend = categories.map((c) => ({
    name: c.name,
    value: invoices.filter((i) => i.category_id === c.id).reduce((s, i) => s + i.total, 0),
  })).filter((c) => c.value > 0);

  // Spend by project
  const projectSpend = projects.map((p) => ({
    name: p.name,
    value: invoices.filter((i) => i.project_id === p.id).reduce((s, i) => s + i.total, 0),
  })).filter((p) => p.value > 0);

  // Monthly spend
  const monthlyMap: Record<string, number> = {};
  invoices.forEach((i) => {
    const month = i.invoice_date?.slice(0, 7) ?? 'Unknown';
    monthlyMap[month] = (monthlyMap[month] ?? 0) + i.total;
  });
  const monthlySpend = Object.entries(monthlyMap).sort().map(([month, value]) => ({ month, value }));

  const assignProject = async (invoiceId: string, projectId: string) => {
    const { error } = await supabase.from('invoices').update({ project_id: projectId }).eq('id', invoiceId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Also upsert vendor mapping
      const inv = invoices.find((i) => i.id === invoiceId);
      if (inv) {
        await supabase.from('vendor_mappings').upsert({ vendor_name: inv.vendor_name, project_id: projectId }, { onConflict: 'vendor_name' });
      }
      fetchData();
      toast({ title: 'Assigned', description: 'Invoice assigned to project.' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container py-8">
          <div className="grid gap-4 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container space-y-8 py-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        {/* KPI Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard title="Total Invoices" value={invoices.length} icon={<FileText className="h-5 w-5 text-primary" />} />
          <KpiCard title="Total Spend" value={`€${totalSpend.toLocaleString('en', { minimumFractionDigits: 2 })}`} icon={<DollarSign className="h-5 w-5 text-primary" />} />
          <KpiCard title="Active Projects" value={activeProjects.length} icon={<FolderOpen className="h-5 w-5 text-primary" />} />
          <KpiCard title="Unpaid" value={unpaid.length} icon={<Clock className="h-5 w-5 text-muted-foreground" />} />
          <KpiCard title="Overdue" value={overdue.length} icon={<AlertCircle className="h-5 w-5 text-primary" />} />
        </div>

        {/* Overdue alert */}
        {overdue.length > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 p-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-medium">{overdue.length} overdue invoice{overdue.length > 1 ? 's' : ''} require attention</p>
          </div>
        )}

        {/* Unassigned invoices */}
        {unassigned.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Unassigned Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Vendor</th>
                      <th className="pb-2 pr-4">Date</th>
                      <th className="pb-2 pr-4">Total</th>
                      <th className="pb-2 pr-4">Category</th>
                      <th className="pb-2">Assign Project</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unassigned.map((inv) => (
                      <tr key={inv.id} className="border-b last:border-0 hover:bg-secondary/50">
                        <td className="py-2 pr-4 font-medium">{inv.vendor_name}</td>
                        <td className="py-2 pr-4">{inv.invoice_date}</td>
                        <td className="py-2 pr-4">{inv.currency}{inv.total?.toLocaleString()}</td>
                        <td className="py-2 pr-4">{(inv as any).category?.name ?? '—'}</td>
                        <td className="py-2">
                          <Select onValueChange={(v) => assignProject(inv.id, v)}>
                            <SelectTrigger className="h-8 w-40">
                              <SelectValue placeholder="Select project" />
                            </SelectTrigger>
                            <SelectContent>
                              {projects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Project budget cards */}
        {projects.length > 0 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold">Project Budgets</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => {
                const spent = invoices.filter((i) => i.project_id === p.id).reduce((s, i) => s + i.total, 0);
                const pct = p.budget > 0 ? Math.min((spent / p.budget) * 100, 100) : 0;
                return (
                  <Link key={p.id} to={`/projects/${p.id}`}>
                    <Card className="cursor-pointer transition-shadow hover:shadow-md">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold">{p.name}</h3>
                          <StatusBadge status={p.status} />
                        </div>
                        <Progress value={pct} className="mt-3" />
                        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                          <span>€{spent.toLocaleString()}</span>
                          <span>of €{p.budget.toLocaleString()}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-3">
          {categorySpend.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Spend by Category</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={categorySpend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(0,100%,65%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {projectSpend.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Spend by Project</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={projectSpend} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} strokeWidth={2}>
                      {projectSpend.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {monthlySpend.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Monthly Spend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthlySpend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="hsl(0,100%,65%)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Payments Due */}
        {(overdue.length > 0 || unpaid.filter((i) => i.due_date).length > 0) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {overdue.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm text-primary">Overdue</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {overdue.map((inv) => (
                      <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center justify-between rounded-lg border border-primary/20 p-3 text-sm hover:bg-secondary/50">
                        <span className="font-medium">{inv.vendor_name}</span>
                        <span className="text-primary">{inv.currency}{inv.total.toLocaleString()}</span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {unpaid.filter((i) => i.due_date).length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Upcoming (30 days)</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {unpaid.filter((i) => {
                      if (!i.due_date) return false;
                      const d = new Date(i.due_date);
                      const now = new Date();
                      return d > now && d <= new Date(now.getTime() + 30 * 86400000);
                    }).map((inv) => (
                      <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-secondary/50">
                        <span className="font-medium">{inv.vendor_name}</span>
                        <span>{inv.due_date}</span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Empty state */}
        {invoices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <FileText className="mb-4 h-12 w-12" />
            <p className="text-lg font-medium">No invoices yet</p>
            <p className="text-sm">Forward an invoice to your connected inbox to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
