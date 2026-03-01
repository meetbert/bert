import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Invoice, Project } from '@/types/database';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { FileText, DollarSign, FolderOpen, AlertCircle, Clock, CalendarDays, TrendingUp, AlertTriangle } from 'lucide-react';
import { CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis } from 'recharts';
import { useUserSettings } from '@/hooks/useUserSettings';
import { formatCurrency } from '@/lib/currency';

const CURRENCY = 'GBP';

const Dashboard = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('6m');
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const [invRes, projRes] = await Promise.all([
      supabase.from('invoices').select('*'),
      supabase.from('projects').select('*'),
    ]);
    setInvoices(invRes.data ?? []);
    setProjects(projRes.data ?? []);
    setLoading(false);
  };

  const activeProjects = projects.filter((p) => p.status === 'Active');
  const unpaid = invoices.filter((i) => i.payment_status === 'unpaid');
  const overdue = invoices.filter((i) => i.payment_status === 'overdue');
  const totalUnpaid = unpaid.reduce((s, i) => s + (i.total ?? 0), 0);
  const totalOverdue = overdue.reduce((s, i) => s + (i.total ?? 0), 0);
  const totalOutstanding = totalUnpaid + totalOverdue;

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
    const month = i.invoice_date?.slice(0, 7) ?? 'Unknown';
    if (month >= cutoffStr) {
      monthlyMap[month] = (monthlyMap[month] ?? 0) + (i.total ?? 0);
    }
  });
  const monthlySpend = Object.entries(monthlyMap).sort().map(([month, value]) => ({ month, value }));
  const avgMonthly = monthlySpend.length > 0 ? monthlySpend.reduce((s, m) => s + m.value, 0) / monthlySpend.length : 0;
  const monthlyWithBurnRate = monthlySpend.map((m) => ({ ...m, burnRate: Math.round(avgMonthly) }));

  // Filtered invoice list based on KPI click
  const getFilteredInvoices = () => {
    if (kpiFilter === 'unpaid') return unpaid;
    if (kpiFilter === 'overdue') return overdue;
    if (kpiFilter === 'dueThisWeek') return dueThisWeek;
    if (kpiFilter === 'outstanding') return [...unpaid, ...overdue];
    return null;
  };

  const filteredInvoices = getFilteredInvoices();

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

        {/* KPI Row */}
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
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unpaid</p>
                  <p className="text-sm text-muted-foreground">{unpaid.length} invoice{unpaid.length !== 1 ? 's' : ''}</p>
                  <p className="text-xl font-bold">{formatCurrency(totalUnpaid, CURRENCY)}</p>
                </div>
              </CardContent>
            </Card>
          </button>
          <button onClick={() => setKpiFilter('overdue')} className="text-left">
            <Card className={`transition-shadow hover:shadow-md ${kpiFilter === 'overdue' ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10"><AlertCircle className="h-5 w-5 text-destructive" /></div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Overdue</p>
                  <p className="text-sm text-destructive/80">{overdue.length} invoice{overdue.length !== 1 ? 's' : ''}</p>
                  <p className="text-xl font-bold text-destructive">{formatCurrency(totalOverdue, CURRENCY)}</p>
                </div>
              </CardContent>
            </Card>
          </button>
          <button onClick={() => setKpiFilter('outstanding')} className="text-left">
            <Card className={`transition-shadow hover:shadow-md ${kpiFilter === 'outstanding' ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary"><DollarSign className="h-5 w-5 text-primary" /></div>
                <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Outstanding</p><p className="text-xl font-bold">{formatCurrency(totalOutstanding, CURRENCY)}</p></div>
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
                      <span className="font-medium">{formatCurrency(inv.total ?? 0, CURRENCY)}</span>
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
              <p className="text-sm font-medium">{overdue.length} overdue invoice{overdue.length > 1 ? 's' : ''} ({formatCurrency(totalOverdue, CURRENCY)}) require attention</p>
            </div>
          </button>
        )}

        {/* Monthly Spend Chart */}
        {!kpiFilter && (
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
                    <RechartsTooltip formatter={(v: number) => formatCurrency(v, CURRENCY)} />
                    <Line type="monotone" dataKey="value" name="Spend" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="burnRate" name="Avg Burn Rate" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* Project budget cards — active only */}
        {activeProjects.length > 0 && !kpiFilter && (
          <div>
            <h2 className="mb-4 text-lg font-semibold">Project Budgets</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeProjects.map((p) => {
                const spent = invoices.filter((i) => i.project_id === p.id).reduce((s, i) => s + (i.total ?? 0), 0);
                const pct = hasBudget(p) ? (spent / p.budget!) * 100 : 0;
                const isOverBudget = pct > 100;
                const overAmount = isOverBudget ? spent - p.budget! : 0;
                const getBudgetColor = () => {
                  if (pct >= 100) return 'text-destructive';
                  if (pct >= 90) return 'text-destructive';
                  if (pct >= 75) return 'text-amber-500';
                  return 'text-muted-foreground';
                };
                const progressValue = Math.min(pct, 100);
                const progressClass = pct >= 90 ? '[&>div]:bg-destructive' : pct >= 75 ? '[&>div]:bg-amber-500' : '';

                return (
                  <Link key={p.id} to={`/projects/${p.id}`}>
                    <Card className={`cursor-pointer transition-shadow hover:shadow-md ${isOverBudget ? 'border-destructive/40' : ''}`}>
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold">{p.name}</h3>
                          {isOverBudget && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                                  <AlertTriangle className="h-3.5 w-3.5" /> Over budget
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{formatCurrency(overAmount, CURRENCY)} over budget</TooltipContent>
                            </Tooltip>
                          )}
                          {!isOverBudget && <StatusBadge status={p.status} />}
                        </div>
                        {hasBudget(p) ? (
                          <>
                            <Progress value={progressValue} className={`mt-3 ${progressClass}`} />
                            <div className="mt-2 flex justify-between text-xs">
                              <span className="text-muted-foreground">{formatCurrency(spent, CURRENCY)}</span>
                              <span className={getBudgetColor()}>{Math.round(pct)}% of {formatCurrency(p.budget!, CURRENCY)}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="mt-3 h-2 rounded-full border border-dashed border-muted-foreground/30" />
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{formatCurrency(spent, CURRENCY)} spent</span>
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
                        <span className="text-destructive">{formatCurrency(inv.total ?? 0, CURRENCY)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Upcoming (30 days)</CardTitle></CardHeader>
              <CardContent>
                {(() => {
                  const thirtyDaysLater = new Date(now.getTime() + 30 * 86400000);
                  const upcoming30 = invoices
                    .filter((i) => {
                      if (i.payment_status === 'paid' || !i.due_date) return false;
                      const d = new Date(i.due_date);
                      return d > now && d <= thirtyDaysLater;
                    })
                    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
                  return upcoming30.length === 0 ? (
                    <EmptyState icon={CalendarDays} title="Nothing due soon" description="No invoices due in the next 30 days." />
                  ) : (
                    <div className="space-y-2">
                      {upcoming30.map((inv) => (
                        <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-secondary/50">
                          <span className="font-medium">{inv.vendor_name}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{formatCurrency(inv.total ?? 0, CURRENCY)}</span>
                            <span className="text-xs text-muted-foreground">{inv.due_date}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty state */}
        {invoices.length === 0 && (
          <EmptyState icon={FileText} title="No invoices yet" description="Connect your inbox or upload invoices to get started." />
        )}
      </div>
    </div>
  );
};

export default Dashboard;
