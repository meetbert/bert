import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Invoice, Project, Category } from '@/types/database';
import { Navbar } from '@/components/Navbar';
import { KpiCard } from '@/components/KpiCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Pencil, Check, X, Download, User, DollarSign, FolderOpen, Tag, Trash2, Clock, FileText } from 'lucide-react';

const InvoiceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Invoice>>({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);

  const fetchInvoice = async () => {
    if (!id) return;
    const [inv, p, c] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', id).single(),
      supabase.from('projects').select('*'),
      supabase.from('invoice_categories').select('*'),
    ]);

    // Enrich with project/category
    const projectsMap = new Map((p.data ?? []).map((proj: any) => [proj.id, proj]));
    const categoriesMap = new Map((c.data ?? []).map((cat: any) => [cat.id, cat]));
    const enriched = inv.data ? {
      ...inv.data,
      project: inv.data.project_id ? projectsMap.get(inv.data.project_id) ?? null : null,
      category: inv.data.category_id ? categoriesMap.get(inv.data.category_id) ?? null : null,
    } : null;

    setInvoice(enriched as any);
    setProjects(p.data ?? []);
    setCategories(c.data ?? []);

    // Get signed URL for document
    if (enriched?.document_path) {
      const { data } = await supabase.storage.from('invoices-bucket').createSignedUrl(enriched.document_path, 3600);
      setDocumentUrl(data?.signedUrl ?? null);
    }

    setLoading(false);
  };

  useEffect(() => { fetchInvoice(); }, [id]);

  const startEdit = () => {
    if (!invoice) return;
    setEditData({
      description: invoice.description,
      line_items: invoice.line_items,
      due_date: invoice.due_date,
      subtotal: invoice.subtotal,
      vat: invoice.vat,
      total: invoice.total,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!invoice) return;
    const { error } = await supabase.from('invoices').update(editData).eq('id', invoice.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setEditing(false);
    fetchInvoice();
    toast({ title: 'Saved' });
  };

  const togglePayment = async () => {
    if (!invoice) return;
    const newStatus = invoice.payment_status === 'paid' ? 'unpaid' : 'paid';
    await supabase.from('invoices').update({ payment_status: newStatus }).eq('id', invoice.id);
    fetchInvoice();
    toast({ title: `Marked as ${newStatus}` });
  };

  const assignProject = async (projectId: string) => {
    if (!invoice) return;
    await supabase.from('invoices').update({ project_id: projectId }).eq('id', invoice.id);
    fetchInvoice();
    toast({ title: 'Project assigned' });
  };

  const assignCategory = async (categoryId: string) => {
    if (!invoice) return;
    await supabase.from('invoices').update({ category_id: categoryId }).eq('id', invoice.id);
    fetchInvoice();
    toast({ title: 'Category assigned' });
  };

  const handleDelete = async () => {
    if (!invoice) return;
    const { error } = await supabase.from('invoices').delete().eq('id', invoice.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Invoice deleted' });
    navigate('/invoices');
  };

  const activityLog = invoice ? [
    { date: invoice.created_at ?? invoice.invoice_date ?? '—', text: 'Invoice created' },
    ...(invoice.payment_status === 'paid' ? [{ date: new Date().toISOString().slice(0, 10), text: 'Marked as paid' }] : []),
    ...(invoice.project_id ? [{ date: new Date().toISOString().slice(0, 10), text: 'Assigned to project' }] : []),
  ] : [];

  const isPdf = invoice?.document_path?.toLowerCase().endsWith('.pdf');

  if (loading) return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container space-y-6 py-8">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-60 rounded-lg" />
      </div>
    </div>
  );

  if (!invoice) return <div className="min-h-screen"><Navbar /><div className="container py-16 text-center text-muted-foreground">Invoice not found</div></div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container space-y-6 py-8">
        <Link to="/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All Invoices</Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Invoice from {invoice.vendor_name}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded bg-secondary px-2 py-1 text-xs">{invoice.invoice_date}</span>
              <span className="rounded bg-secondary px-2 py-1 text-xs">#{invoice.invoice_number}</span>
              <span className="rounded bg-secondary px-2 py-1 text-xs">{invoice.currency}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={invoice.payment_status} />
            <Button variant="outline" size="sm" onClick={togglePayment}>
              Mark as {invoice.payment_status === 'paid' ? 'Unpaid' : 'Paid'}
            </Button>
            {!editing && <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>}
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteModal(true)}><Trash2 className="mr-1 h-3.5 w-3.5" /> Delete</Button>
          </div>
        </div>

        {/* Activity Log */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activityLog.map((entry, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm">{entry.text}</p>
                    <p className="text-xs text-muted-foreground">{typeof entry.date === 'string' ? entry.date.slice(0, 10) : '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Vendor" value={invoice.vendor_name} icon={<User className="h-5 w-5 text-primary" />} />
          <KpiCard title="Total" value={`${invoice.currency}${invoice.total?.toLocaleString()}`} icon={<DollarSign className="h-5 w-5 text-primary" />} />
          <KpiCard title="Project" value={(invoice as any).project?.name ?? 'Unassigned'} icon={<FolderOpen className="h-5 w-5 text-muted-foreground" />} />
          <KpiCard title="Category" value={(invoice as any).category?.name ?? 'Uncategorized'} icon={<Tag className="h-5 w-5 text-muted-foreground" />} />
        </div>

        {/* Assign dropdowns */}
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Assign Project</Label>
            <Select value={invoice.project_id ?? ''} onValueChange={assignProject}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Assign Category</Label>
            <Select value={invoice.category_id?.toString() ?? ''} onValueChange={assignCategory}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Document viewer */}
        {invoice.document_path && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" /> Attachment
              </CardTitle>
              {documentUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={documentUrl} target="_blank" rel="noopener noreferrer"><Download className="mr-1 h-4 w-4" /> Download</a>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isPdf && documentUrl ? (
                <iframe
                  src={documentUrl}
                  className="h-[600px] w-full rounded-lg border"
                  title="Invoice PDF"
                />
              ) : documentUrl ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
                  <Button variant="outline" size="sm" asChild>
                    <a href={documentUrl} target="_blank" rel="noopener noreferrer"><Download className="mr-1 h-4 w-4" /> Download File</a>
                  </Button>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading document...</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Detail card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Details</CardTitle>
            {editing && (
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit}><Check className="mr-1 h-3.5 w-3.5" /> Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X className="mr-1 h-3.5 w-3.5" /> Cancel</Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                {editing ? (
                  <Input value={editData.description ?? ''} onChange={(e) => setEditData({ ...editData, description: e.target.value })} />
                ) : (
                  <p className="text-sm">{invoice.description || '—'}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Line Items</Label>
                {editing ? (
                  <Input value={editData.line_items ?? ''} onChange={(e) => setEditData({ ...editData, line_items: e.target.value })} />
                ) : (
                  <p className="text-sm">{invoice.line_items || '—'}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Due Date</Label>
                {editing ? (
                  <Input type="date" value={editData.due_date ?? ''} onChange={(e) => setEditData({ ...editData, due_date: e.target.value })} />
                ) : (
                  <p className="text-sm">{invoice.due_date || '—'}</p>
                )}
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{invoice.currency}{invoice.subtotal?.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">VAT</span><span>{invoice.currency}{invoice.vat?.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2"><span>Total</span><span>{invoice.currency}{invoice.total?.toLocaleString()}</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Delete confirmation modal */}
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete this invoice?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This action cannot be undone. The invoice from <strong>{invoice.vendor_name}</strong> will be permanently removed.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete Invoice</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default InvoiceDetail;
