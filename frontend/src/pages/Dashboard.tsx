import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Invoice, Project, Category } from '@/types/database';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FileText, FolderOpen, AlertCircle, Clock, CalendarDays, TrendingUp, AlertTriangle } from 'lucide-react';
import { CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis } from 'recharts';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { formatCurrency, convertToBase } from '@/lib/currency';
import { useDemoData } from '@/contexts/DemoDataContext';

const Dashboard = () => {
  const navigate = useNavigate();
  const { baseCurrency } = useUserSettings();
  const { rates } = useExchangeRates(baseCurrency);
  const { isDemoMode, demoInvoices, demoProjects, demoCategories, demoProjectCategories } = useDemoData();
  const [rawInvoices, setRawInvoices] = useState<Invoice[]>([]);
  const [rawProjects, setRawProjects] = useState<Project[]>([]);
  const [rawCategories, setRawCategories] = useState<Category[]>([]);
  const [rawProjectCategories, setRawProjectCategories] = useState<{ project_id: string; category_id: string; budget: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('6m');
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const [invRes, projRes, catRes, pcRes] = await Promise.all([
      supabase.from('invoices').select('*'),
      supabase.from('projects').select('*'),
      supabase.from('invoice_categories').select('*'),
      supabase.from('project_categories').select('*'),
    ]);
    const today = new Date().toISOString().split('T')[0];
    const enriched = (invRes.data ?? []).map((inv: any) => {
      let status = inv.payment_status;
      if (status === 'unpaid' && inv.due_date && inv.due_date < today) status = 'overdue';
      return { ...inv, payment_status: status };
    });
    setRawInvoices(enriched);
    setRawProjects(projRes.data ?? []);
    setRawCategories(catRes.data ?? []);
    setRawProjectCategories(pcRes.data ?? []);
    setLoading(false);
  };

  // Merge demo data when tour is active
  const invoices = useMemo(() => isDemoMode ? [...demoInvoices, ...rawInvoices] : rawInvoices, [isDemoMode, demoInvoices, rawInvoices]);
  const projects = useMemo(() => isDemoMode ? [...demoProjects, ...rawProjects] : rawProjects, [isDemoMode, demoProjects, rawProjects]);
  const categories = useMemo(() => isDemoMode ? [...demoCategories, ...rawCategories] : rawCategories, [isDemoMode, demoCategories, rawCategories]);
  const projectCategories = useMemo(() => isDemoMode ? [...demoProjectCategories, ...rawProjectCategories] : rawProjectCategories, [isDemoMode, demoProjectCategories, rawProjectCategories]);

  const activeProjects = projects.filter((p) => p.status === 'Active');
  const overdue = invoices.filter((i) => i.payment_status === 'overdue');
  const outstanding = invoices.filter((i) => i.payment_status === 'unpaid' || i.payment_status === 'overdue');
  const totalOutstanding = outstanding.reduce((s, i) => s + convertToBase(i.total ?? 0, i.currency ?? baseCurrency, rates), 0);
  const totalOverdue = overdue.reduce((s, i) => s + convertToBase(i.total ?? 0, i.currency ?? baseCurrency, rates), 0);

  const now = new Date();
  const oneWeekLater = new Date(now.getTime() + 7 * 86400000);
  const dueThisWeek = invoices.filter((i) => {
    if (i.payment_status === 'paid' || !i.due_date) return false;
    const d = new Date(i.due_date);
    return d >= now && d <= oneWeekLater;
  });

  // Monthly spend data — filter to selected time range
  const monthsToShow = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - monthsToShow + 1, 1);
  const cutoffStr = cutoffDate.toISOString().slice(0, 7);

  const monthlyMap: Record<string, number> = {};
  invoices.forEach((i) => {
    if (!i.invoice_date) return;
    const month = i.invoice_date.slice(0, 7);
    if (month >= cutoffStr) {
      monthlyMap[month] = (monthlyMap[month] ?? 0) + convertToBase(i.total ?? 0, i.currency ?? baseCurrency, rates);
    }
  });
  const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthlySpend = Object.entries(monthlyMap).sort().map(([month, value]) => {
    const [y, m] = month.split('-');
    const label = m ? `${SHORT_MONTHS[parseInt(m, 10) - 1]} ${y.slice(2)}` : month;
    return { month: label, value };
  });
  const avgMonthly = monthlySpend.length > 0 ? monthlySpend.reduce((s, m) => s + m.value, 0) / monthlySpend.length : 0;
  const monthlyWithBurnRate = monthlySpend.map((m) => ({ ...m, burnRate: Math.round(avgMonthly) }));

  // Filtered invoice list based on KPI click
  const getFilteredInvoices = () => {
    if (kpiFilter === 'unpaid') return outstanding;
    if (kpiFilter === 'overdue') return overdue;
    if (kpiFilter === 'dueThisWeek') return dueThisWeek;

    return null;
  };

  const filteredInvoices = getFilteredInvoices();

  const hasBudget = (p: Project) => p.budget != null && p.budget > 0;

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="container space-y-8 py-8">
          <Skeleton className="h-8 w-40" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
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
      <div className="container space-y-8 py-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        {/* KPI Row */}
        <div data-tour="kpi-row" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button onClick={() => setKpiFilter(null)} className="text-left">
            <Card className={`h-full transition-shadow hover:shadow-md ${kpiFilter === null ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary"><FolderOpen className="h-5 w-5 text-primary" /></div>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Projects</p>
                  <p className="text-xl font-bold">{activeProjects.length}</p>
                </div>
              </CardContent>
            </Card>
          </button>
          <button onClick={() => setKpiFilter('unpaid')} className="text-left">
            <Card className={`h-full transition-shadow hover:shadow-md ${kpiFilter === 'unpaid' ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary"><Clock className="h-5 w-5 text-muted-foreground" /></div>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outstanding ({outstanding.length})</p>
                  <p className="text-xl font-bold truncate">{formatCurrency(totalOutstanding, baseCurrency)}</p>
                </div>
              </CardContent>
            </Card>
          </button>
          <button onClick={() => setKpiFilter('overdue')} className="text-left">
            <Card className={`h-full transition-shadow hover:shadow-md ${kpiFilter === 'overdue' ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10"><AlertCircle className="h-5 w-5 text-destructive" /></div>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Overdue ({overdue.length})</p>
                  <p className="text-xl font-bold truncate text-destructive">{formatCurrency(totalOverdue, baseCurrency)}</p>
                </div>
              </CardContent>
            </Card>
          </button>
          <button onClick={() => setKpiFilter('dueThisWeek')} className="text-left">
            <Card className={`h-full transition-shadow hover:shadow-md ${kpiFilter === 'dueThisWeek' ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary"><CalendarDays className="h-5 w-5 text-muted-foreground" /></div>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Due This Week</p>
                  <p className="text-xl font-bold">{dueThisWeek.length}</p>
                </div>
              </CardContent>
            </Card>
          </button>
        </div>

        {/* Filtered invoice list from KPI click */}
        {filteredInvoices && (
          <div>
            <div className="mb-3">
              <h2 className="text-sm font-semibold capitalize">{kpiFilter === 'dueThisWeek' ? 'Due This Week' : kpiFilter === 'outstanding' ? 'Outstanding Invoices' : `${kpiFilter} Invoices`}</h2>
            </div>
            {filteredInvoices.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No invoices in this category.</p>
            ) : (
              <div className="overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-secondary/30 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="p-3">Vendor</th><th className="p-3">Due Date</th><th className="p-3">Total</th><th className="p-3">Status</th>
                  </tr></thead>
                  <tbody>
                    {filteredInvoices.slice(0, 10).map((inv) => (
                      <tr key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)} className="border-b last:border-0 cursor-pointer transition-colors hover:bg-secondary/60">
                        <td className="p-3 font-medium">{inv.vendor_name}</td>
                        <td className="p-3 text-muted-foreground">{inv.due_date ?? '—'}</td>
                        <td className="p-3 font-medium">
                          {formatCurrency(convertToBase(inv.total ?? 0, inv.currency ?? baseCurrency, rates), baseCurrency)}
                          {inv.currency && inv.currency !== baseCurrency && (
                            <span className="ml-1 text-xs text-muted-foreground">({formatCurrency(inv.total ?? 0, inv.currency)})</span>
                          )}
                        </td>
                        <td className="p-3"><StatusBadge status={inv.payment_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate(`/invoices?status=${kpiFilter === 'overdue' ? 'overdue' : 'unpaid'}`)}>View all →</Button>
                </div>
              </div>
            )}
          </div>
        )}


        {/* Monthly Spend Chart */}
        {!kpiFilter && (
          <Card data-tour="monthly-spend">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Monthly Spend</CardTitle>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
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
                    <RechartsTooltip formatter={(v: number) => formatCurrency(v, baseCurrency)} />
                    <Line type="monotone" dataKey="value" name="Spend" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="burnRate" name="Avg Burn Rate" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* Project budgets — per-category progress bars */}
        {activeProjects.length > 0 && !kpiFilter && (
          <div data-tour="project-budgets">
            <h2 className="mb-4 text-lg font-semibold">Project Budgets</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {activeProjects.map((p) => {
                const projectInvoices = invoices.filter((i) => i.project_id === p.id);
                const spent = projectInvoices.reduce((s, i) => s + convertToBase(i.total ?? 0, i.currency ?? baseCurrency, rates), 0);
                const pct = hasBudget(p) ? (spent / p.budget!) * 100 : 0;
                const isOverBudget = pct > 100;

                // Per-category spend — seed with categories assigned to this project
                const isCategoryMode = p.budget_mode === 'category';
                const projCats = projectCategories.filter(pc => pc.project_id === p.id);
                const catMap: Record<string, number> = {};
                projCats.forEach((pc) => { catMap[pc.category_id] = 0; });
                projectInvoices.forEach((i) => {
                  const cid = (i.category_id && projCats.some(pc => pc.category_id === i.category_id))
                    ? i.category_id
                    : '__uncategorized';
                  catMap[cid] = (catMap[cid] ?? 0) + convertToBase(i.total ?? 0, i.currency ?? baseCurrency, rates);
                });
                const catRows = Object.entries(catMap)
                  .map(([cid, amount]) => {
                    const catBudget = isCategoryMode
                      ? (projCats.find(pc => pc.category_id === cid)?.budget ?? 0)
                      : 0;
                    const catPct = isCategoryMode
                      ? (catBudget > 0 ? (amount / catBudget) * 100 : 0)
                      : (hasBudget(p) ? (amount / p.budget!) * 100 : (spent > 0 ? (amount / spent) * 100 : 0));
                    return {
                      id: cid,
                      name: cid === '__uncategorized' ? 'Uncategorized' : categories.find(c => c.id === cid)?.name ?? 'Unknown',
                      amount,
                      catBudget,
                      pct: Math.min(catPct, 100),
                    };
                  })
                  .sort((a, b) => b.amount - a.amount);

                return (
                  <Link key={p.id} to={`/projects/${p.id}`}>
                    <Card className={`h-full cursor-pointer transition-shadow hover:shadow-md ${isOverBudget ? 'border-destructive/40' : ''}`}>
                      <CardContent className="p-5">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{p.name}</h3>
                            {isOverBudget && (
                              <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                                <AlertTriangle className="h-3 w-3" /> Over
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatCurrency(spent, baseCurrency)}{hasBudget(p) && <> / {formatCurrency(p.budget!, baseCurrency)}</>}
                          </span>
                        </div>

                        {/* Overall progress */}
                        {hasBudget(p) && (
                          <div className="mt-3">
                            <div className={`flex h-1.5 w-full overflow-hidden rounded-full bg-secondary`}>
                              <div
                                className="rounded-full transition-all bg-primary"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {Math.round(pct)}% used
                            </p>
                          </div>
                        )}

                        {/* Category breakdown bars */}
                        {catRows.length > 0 && (
                          <div className="mt-4 space-y-2.5">
                            {catRows.map((cat) => (
                              <div key={cat.id}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">{cat.name}</span>
                                  <span className="font-medium">
                                    {formatCurrency(cat.amount, baseCurrency)}
                                    {isCategoryMode && cat.catBudget > 0 && (
                                      <span className="text-muted-foreground font-normal"> / {formatCurrency(cat.catBudget, baseCurrency)}</span>
                                    )}
                                  </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                                  <div
                                    className="h-full rounded-full bg-muted-foreground/40 transition-all"
                                    style={{ width: `${cat.pct}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {!hasBudget(p) && catRows.length === 0 && (
                          <p className="mt-3 text-xs text-muted-foreground">No spend yet</p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        )}


      </div>
    </div>
  );
};

export default Dashboard;
