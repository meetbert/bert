import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Invoice, Project, Category } from '@/types/database';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { FileText, DollarSign, FolderOpen, AlertCircle, Clock, CalendarDays, TrendingUp } from 'lucide-react';
import { CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis } from 'recharts';
import { useUserSettings } from '@/hooks/useUserSettings';
import { formatCurrency } from '@/lib/currency';

const Dashboard = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('6m');
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const { baseCurrency } = useUserSettings();

  useEffect(() => { fetchData(); }, []);

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

  const activeProjects = projects.filter((p) => p.status === 'Active');
  const unpaid = invoices.filter((i) => i.payment_status === 'unpaid');
  const overdue = invoices.filter((i) => i.payment_status === 'overdue');
  const totalOutstanding = [...unpaid, ...overdue].reduce((s, i) => s + (i.total ?? 0), 0);

  const now = new Date();
  const oneWeekLater = new Date(now.getTime() + 7 * 86400000);
  const dueThisWeek = invoices.filter((i) => {
    if (i.payment_status === 'paid' || !i.due_date) return false;
    const d = new Date(i.due_date);
    return d >= now && d <= oneWeekLater;
  });

  const thirtyDaysLater = new Date(now.getTime() + 30 * 86400000);
  const upcoming30 = invoices.filter((i) => {
    if (i.payment_status === 'paid' || !i.due_date) return false;
    const d = new Date(i.due_date);
    return d > now && d <= thirtyDaysLater;
  });

  // Monthly spend data
  const monthlyMap: Record<string, number> = {};
  invoices.forEach((i) => {
    const month = i.invoice_date?.slice(0, 7) ?? 'Unknown';
    monthlyMap[month] = (monthlyMap[month] ?? 0) + (i.total ?? 0);
  });
  let monthlySpend = Object.entries(monthlyMap).sort().map(([month, value]) => ({ month, value }));

  // Filter by time range
  const monthsToShow = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
  if (monthlySpend.length > monthsToShow) {
    monthlySpend = monthlySpend.slice(-monthsToShow);
  }

  // Add placeholder burn-rate line
  const avgMonthly = monthlySpend.length > 0 ? monthlySpend.reduce((s, m) => s + m.value, 0) / monthlySpend.length : 0;
  const monthlyWithBurnRate = monthlySpend.map((m) => ({ ...m, burnRate: Math.round(avgMonthly) }));

  // Budget utilisation data
  const budgetData = projects
    .filter((p) => p.budget != null && p.budget > 0)
    .map((p) => {
      const spent = invoices.filter((i) => i.project_id === p.id).reduce((s, i) => s + (i.total ?? 0), 0);
      const pct = Math.min(Math.round((spent / p.budget!) * 100), 100);
      return { name: p.name, pct, spent, budget: p.budget! };
    })
    .sort((a, b) => b.pct - a.pct);

  const getBudgetColor = (pct: number) => {
    if (pct >= 90) return 'hsl(0, 100%, 65%)';
    if (pct >= 75) return 'hsl(38, 92%, 50%)';
    return 'hsl(var(--foreground))';
  };

  // Filtered invoice list based on KPI click
  const getFilteredInvoices = () => {
    if (kpiFilter === 'unpaid') return unpaid;
    if (kpiFilter === 'overdue') return overdue;
    if (kpiFilter === 'dueThisWeek') return dueThisWeek;
    if (kpiFilter === 'outstanding') return [...unpaid, ...overdue];
    return null;
  };

  const filteredInvoices = getFilteredInvoices();

  const assignProject = async (invoiceId: string, projectId: string) => {
    const { error } = await supabase.from('invoices').update({ project_id: projectId }).eq('id', invoiceId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      fetchData();
      toast({ title: 'Assigned', description: 'Invoice assigned to project.' });
    }
  };

  const hasBudget = (p: Project) => p.budget != null && p.budget > 0;

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container space-y-8 py-8">
          <Skeleton className="h-8 w-40" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-lg" />
            <Skeleton className="h-72 rounded-lg" />
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

        {/* KPI Row - Clickable cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <button onClick={() => setKpiFilter(null)} className="text-left">
            <Card className={`transition-shadow hover:shadow-md ${kpiFilter === null ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary"><FolderOpen className="h-5 w-5 text-primary" /></div>
                <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Projects</p><p className="text-2xl font-bold">{activeProjects.length}</p></div>
              </CardContent>
            </Card>
          </button>
          <button onClick={() => setKpiFilter('unpaid')} className="text-left">
            <Card className={`transition-shadow hover:shadow-md ${kpiFilter === 'unpaid' ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary"><Clock className="h-5 w-5 text-muted-foreground" /></div>
                <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unpaid</p><p className="text-2xl font-bold">{unpaid.length}</p></div>
              </CardContent>
            </Card>
          </button>
          <button onClick={() => setKpiFilter('overdue')} className="text-left">
            <Card className={`transition-shadow hover:shadow-md ${kpiFilter === 'overdue' ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10"><AlertCircle className="h-5 w-5 text-destructive" /></div>
                <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Overdue</p><p className="text-2xl font-bold text-destructive">{overdue.length}</p></div>
              </CardContent>
            </Card>
          </button>
          <button onClick={() => setKpiFilter('outstanding')} className="text-left">
            <Card className={`transition-shadow hover:shadow-md ${kpiFilter === 'outstanding' ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary"><DollarSign className="h-5 w-5 text-primary" /></div>
                <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Outstanding</p><p className="text-2xl font-bold">{formatCurrency(totalOutstanding, baseCurrency)}</p></div>
              </CardContent>
            </Card>
          </button>
          <button onClick={() => setKpiFilter('dueThisWeek')} className="text-left">
            <Card className={`transition-shadow hover:shadow-md ${kpiFilter === 'dueThisWeek' ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary"><CalendarDays className="h-5 w-5 text-muted-foreground" /></div>
                <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Due This Week</p><p className="text-2xl font-bold">{dueThisWeek.length}</p></div>
              </CardContent>
            </Card>
          </button>
        </div>

        {/* Filtered invoice list from KPI click */}
        {filteredInvoices && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm capitalize">{kpiFilter === 'dueThisWeek' ? 'Due This Week' : kpiFilter === 'outstanding' ? 'Outstanding Invoices' : `${kpiFilter} Invoices`}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setKpiFilter(null)}>Clear</Button>
            </CardHeader>
            <CardContent>
              {filteredInvoices.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No invoices in this category.</p>
              ) : (
                <div className="space-y-2">
                  {filteredInvoices.slice(0, 10).map((inv) => (
                    <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm transition-colors hover:bg-secondary/50">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{inv.vendor_name}</span>
                        <StatusBadge status={inv.payment_status} />
                      </div>
                      <span className="font-medium">{formatCurrency(inv.total ?? 0, baseCurrency)}</span>
                    </Link>
                  ))}
                  {filteredInvoices.length > 10 && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate('/invoices')}>View all →</Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Overdue alert */}
        {overdue.length > 0 && !kpiFilter && (
          <button onClick={() => setKpiFilter('overdue')} className="w-full text-left">
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 transition-colors hover:bg-destructive/10">
              <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
              <p className="text-sm font-medium">{overdue.length} overdue invoice{overdue.length > 1 ? 's' : ''} require attention</p>
            </div>
          </button>
        )}

        {/* Charts row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Monthly Spend Chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Monthly Spend</CardTitle>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3m">3 months</SelectItem>
                  <SelectItem value="6m">6 months</SelectItem>
                  <SelectItem value="12m">12 months</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {monthlyWithBurnRate.length === 0 ? (
                <EmptyState icon={TrendingUp} title="No spend data yet" description="Invoices will appear here once processed." />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={monthlyWithBurnRate}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v, baseCurrency)} />
                    <Line type="monotone" dataKey="value" name="Spend" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="burnRate" name="Avg Burn Rate" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Budget Utilisation */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Budget Utilisation</CardTitle></CardHeader>
            <CardContent>
              {budgetData.length === 0 ? (
                <EmptyState icon={FolderOpen} title="No budgets set" description="Set budgets on your projects to track utilisation." />
              ) : (
                <div className="space-y-4">
                  {budgetData.map((p) => (
                    <div key={p.name}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground" style={{ color: getBudgetColor(p.pct) }}>{p.pct}%</span>
                      </div>
                      <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${p.pct}%`, backgroundColor: getBudgetColor(p.pct) }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span>{formatCurrency(p.spent, baseCurrency)}</span>
                        <span>of {formatCurrency(p.budget, baseCurrency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Project budget cards */}
        {projects.length > 0 && !kpiFilter && (
          <div>
            <h2 className="mb-4 text-lg font-semibold">Project Budgets</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => {
                const spent = invoices.filter((i) => i.project_id === p.id).reduce((s, i) => s + (i.total ?? 0), 0);
                const pct = hasBudget(p) ? Math.min((spent / p.budget!) * 100, 100) : 0;
                return (
                  <Link key={p.id} to={`/projects/${p.id}`}>
                    <Card className="cursor-pointer transition-shadow hover:shadow-md">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold">{p.name}</h3>
                          <StatusBadge status={p.status} />
                        </div>
                        {hasBudget(p) ? (
                          <>
                            <Progress value={pct} className="mt-3" />
                            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                              <span>{formatCurrency(spent, baseCurrency)}</span>
                              <span>of {formatCurrency(p.budget!, baseCurrency)}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="mt-3 h-2 rounded-full border border-dashed border-muted-foreground/30" />
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{formatCurrency(spent, baseCurrency)} spent</span>
                              <span className="text-primary hover:underline">Set budget →</span>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Upcoming & Overdue */}
        {!kpiFilter && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Overdue */}
            <Card>
              <CardHeader><CardTitle className="text-sm text-destructive">Overdue</CardTitle></CardHeader>
              <CardContent>
                {overdue.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No overdue invoices 🎉</p>
                ) : (
                  <div className="space-y-2">
                    {overdue.map((inv) => (
                      <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center justify-between rounded-lg border border-destructive/20 p-3 text-sm hover:bg-secondary/50">
                        <span className="font-medium">{inv.vendor_name}</span>
                        <span className="text-destructive">{formatCurrency(inv.total ?? 0, baseCurrency)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming 30 days */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Upcoming (30 days)</CardTitle></CardHeader>
              <CardContent>
                {upcoming30.length === 0 ? (
                  <EmptyState icon={CalendarDays} title="Nothing due soon" description="No invoices due in the next 30 days." />
                ) : (
                  <div className="space-y-2">
                    {upcoming30.map((inv) => (
                      <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-secondary/50">
                        <span className="font-medium">{inv.vendor_name}</span>
                        <span className="text-muted-foreground">{inv.due_date}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Unassigned invoices */}
        {!kpiFilter && invoices.filter((i) => !i.project_id).length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Unassigned Invoices</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Vendor</th><th className="pb-2 pr-4">Date</th><th className="pb-2 pr-4">Total</th><th className="pb-2 pr-4">Category</th><th className="pb-2">Assign Project</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.filter((i) => !i.project_id).map((inv) => (
                      <tr key={inv.id} className="border-b last:border-0 hover:bg-secondary/50">
                        <td className="py-2 pr-4 font-medium">{inv.vendor_name}</td>
                        <td className="py-2 pr-4">{inv.invoice_date}</td>
                        <td className="py-2 pr-4">{formatCurrency(inv.total ?? 0, baseCurrency)}</td>
                        <td className="py-2 pr-4">{(inv as any).category?.name ?? '—'}</td>
                        <td className="py-2">
                          <Select onValueChange={(v) => assignProject(inv.id, v)}>
                            <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Select project" /></SelectTrigger>
                            <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
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

        {/* Empty state */}
        {invoices.length === 0 && (
          <EmptyState icon={FileText} title="No invoices yet" description="Forward an invoice to your connected inbox to get started." />
        )}
      </div>
    </div>
  );
};

export default Dashboard;
