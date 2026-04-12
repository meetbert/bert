import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Project } from '@/types/database';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, FolderOpen, AlertTriangle } from 'lucide-react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { formatCurrency, convertToBase } from '@/lib/currency';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { ProjectCreationWizard } from '@/components/ProjectCreationWizard';

const Projects = () => {
  const [rawProjects, setRawProjects] = useState<Project[]>([]);
  const [rawInvoices, setRawInvoices] = useState<{ id: string; total: number; currency: string | null; project_id: string | null }[]>([]);
  const { baseCurrency } = useUserSettings();
  const { rates } = useExchangeRates(baseCurrency);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'Active' | 'Completed'>('all');

  const fetchData = async () => {
    const [p, i] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('invoices').select('id, total, currency, project_id'),
    ]);
    setRawProjects(p.data ?? []);
    setRawInvoices(i.data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const projects = rawProjects;
  const invoices = rawInvoices;


  const filteredProjects = (filterTab === 'all' ? projects : projects.filter((p) => p.status === filterTab))
    .slice()
    .sort((a, b) => {
      if (filterTab === 'all') {
        if (a.status !== b.status) return a.status === 'Active' ? -1 : 1;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const renderProjectCard = (p: Project) => {
    const spent = invoices.filter((i) => i.project_id === p.id).reduce((s, i) => s + convertToBase(i.total ?? 0, i.currency ?? baseCurrency, rates), 0);
    const hasBudget = p.budget != null && p.budget > 0;
    const rawPct = hasBudget ? (spent / p.budget!) * 100 : 0;
    const isOverBudget = rawPct > 100;
    const pct = Math.min(rawPct, 100);

    return (
      <Link key={p.id} to={`/projects/${p.id}`}>
        <Card className={`cursor-pointer transition-shadow hover:shadow-md ${isOverBudget ? 'border-destructive/40' : ''}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-semibold truncate">{p.name}</h3>
                {isOverBudget && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                    <AlertTriangle className="h-3 w-3" /> Over
                  </span>
                )}
              </div>
              <StatusBadge status={p.status} />
            </div>
            {hasBudget ? (
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
                <div className="mt-2 text-xs text-muted-foreground">{formatCurrency(spent, baseCurrency)} spent</div>
              </>
            )}
          </CardContent>
        </Card>
      </Link>
    );
  };

  return (
    <div className="min-h-screen">
      <div data-tour="projects-list" className="container space-y-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-[-0.03em]">Projects</h1>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Project</DialogTitle>
            </DialogHeader>
            <ProjectCreationWizard
              onComplete={() => {
                setShowCreateDialog(false);
                fetchData();
              }}
              onCancel={() => setShowCreateDialog(false)}
            />
          </DialogContent>
        </Dialog>

        {/* Filter tabs + Add Project */}
        <div className="flex items-center justify-between">
          <div className="inline-flex gap-1 rounded-lg border bg-card p-1">
            {(['all', 'Active', 'Completed'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  filterTab === tab ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'all' ? 'All' : tab}
              </button>
            ))}
          </div>
          <button
            data-tour="add-project-btn"
            onClick={() => setShowCreateDialog(true)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Project
          </button>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
          </div>
        ) : filteredProjects.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No projects yet" description="Create your first project above to start tracking budgets." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map(renderProjectCard)}
          </div>
        )}

      </div>
    </div>
  );
};

export default Projects;
