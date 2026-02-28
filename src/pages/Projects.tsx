import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Project } from '@/types/database';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, ChevronUp, Trash2, Pencil, FolderOpen } from 'lucide-react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { formatCurrency } from '@/lib/currency';

const Projects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<{ id: string; total: number; project_id: string | null }[]>([]);
  const { baseCurrency } = useUserSettings();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [status, setStatus] = useState<'Active' | 'Completed'>('Active');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'Active' | 'Completed'>('all');

  const fetchData = async () => {
    const [p, i] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('invoices').select('id, total, project_id'),
    ]);
    setProjects(p.data ?? []);
    setInvoices(i.data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (editingId) {
      const { error } = await supabase.from('projects').update({ name: name.trim(), budget: budget ? parseFloat(budget) : 0, status }).eq('id', editingId);
      if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
      toast({ title: 'Updated' });
      setEditingId(null);
    } else {
      const { error } = await supabase.from('projects').insert({ name: name.trim(), budget: budget ? parseFloat(budget) : 0, status });
      if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
      toast({ title: 'Project created' });
    }
    setName(''); setBudget(''); setStatus('Active'); setShowForm(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('projects').delete().eq('id', deleteId);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setDeleteId(null);
    fetchData();
    toast({ title: 'Deleted' });
  };

  const changeProjectStatus = async (projectId: string, newStatus: string) => {
    const { error } = await supabase.from('projects').update({ status: newStatus }).eq('id', projectId);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    fetchData();
    toast({ title: `Status → ${newStatus}` });
  };

  const startEdit = (p: Project) => {
    setEditingId(p.id);
    setName(p.name);
    setBudget(p.budget?.toString() ?? '');
    setStatus(p.status as any);
    setShowForm(true);
  };

  const filteredProjects = filterTab === 'all' ? projects : projects.filter((p) => p.status === filterTab);
  const activeProjects = filteredProjects.filter((p) => p.status === 'Active');
  const completedProjects = filteredProjects.filter((p) => p.status === 'Completed');

  const renderProjectCard = (p: Project) => {
    const spent = invoices.filter((i) => i.project_id === p.id).reduce((s, i) => s + (i.total ?? 0), 0);
    const hasBudget = p.budget != null && p.budget > 0;
    const pct = hasBudget ? Math.min((spent / p.budget!) * 100, 100) : 0;

    return (
      <Card key={p.id} className="group relative">
        <Link to={`/projects/${p.id}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{p.name}</h3>
              <div onClick={(e) => e.preventDefault()}>
                <Select value={p.status} onValueChange={(v) => changeProjectStatus(p.id, v)}>
                  <SelectTrigger className="h-7 w-28 text-xs border-0 bg-transparent p-0 shadow-none">
                    <StatusBadge status={p.status} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{formatCurrency(spent, baseCurrency)} spent</span>
                  <button onClick={(e) => { e.preventDefault(); startEdit(p); }} className="text-primary hover:underline">Set budget →</button>
                </div>
              </>
            )}
          </CardContent>
        </Link>
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={(e) => { e.preventDefault(); startEdit(p); }} className="rounded p-1 hover:bg-secondary"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={(e) => { e.preventDefault(); setDeleteId(p.id); }} className="rounded p-1 text-destructive hover:bg-secondary"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container space-y-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Projects</h1>
          <Button size="sm" onClick={() => { setEditingId(null); setName(''); setBudget(''); setShowForm(!showForm); }}>
            {showForm ? <ChevronUp className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
            {showForm ? 'Close' : 'Add Project'}
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
                </div>
                <div className="space-y-2">
                  <Label>Budget</Label>
                  <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="50000" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <RadioGroup value={status} onValueChange={(v) => setStatus(v as any)} className="flex gap-4">
                  <div className="flex items-center gap-2"><RadioGroupItem value="Active" id="sActive" /><Label htmlFor="sActive">Active</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="Completed" id="sCompleted" /><Label htmlFor="sCompleted">Completed</Label></div>
                </RadioGroup>
              </div>
              <Button onClick={handleSubmit}>{editingId ? 'Save Changes' : 'Add Project'}</Button>
            </CardContent>
          </Card>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
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

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
          </div>
        ) : filteredProjects.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No projects yet" description="Create your first project above to start tracking budgets." />
        ) : (
          <>
            {/* Active projects */}
            {filterTab !== 'Completed' && activeProjects.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeProjects.map(renderProjectCard)}
              </div>
            )}

            {/* Completed / Archive section */}
            {completedProjects.length > 0 && (
              <div>
                {filterTab === 'all' && <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">Archive</h2>}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {completedProjects.map(renderProjectCard)}
                </div>
              </div>
            )}
          </>
        )}

        {/* Delete confirm dialog */}
        <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete project?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This action cannot be undone. All invoices will be unassigned.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Projects;
