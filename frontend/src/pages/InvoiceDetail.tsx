import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Invoice, Project, Category } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { formatCurrency, convertToBase, SUPPORTED_CURRENCIES } from '@/lib/currency';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { ArrowLeft, Pencil, Check, X, Download, Trash2, Clock, FileText } from 'lucide-react';

const InvoiceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Invoice>>({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const { baseCurrency } = useUserSettings();
  const { rates } = useExchangeRates(baseCurrency);

  const fetchInvoice = async () => {
    if (!id) { setLoading(false); return; }
    try {
      const [inv, p, c] = await Promise.all([
        supabase.from('invoices').select('*').eq('id', id).single(),
        supabase.from('projects').select('*'),
        supabase.from('invoice_categories').select('*'),
      ]);

      if (inv.error) {
        setError(inv.error.message);
        setLoading(false);
        return;
      }

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

      // Non-blocking signed URL fetch — blob for PDFs to prevent auto-download
      if (enriched?.document_path) {
        const isPdfFile = enriched.document_path.toLowerCase().endsWith('.pdf');

        supabase.storage.from('invoices-bucket')
          .createSignedUrl(enriched.document_path, 3600)
          .then(async ({ data }) => {
            if (!data?.signedUrl) { setDocumentUrl(null); return; }
            setDownloadUrl(data.signedUrl);

            if (isPdfFile) {
              try {
                const resp = await fetch(data.signedUrl);
                const blob = await resp.blob();
                const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
                setDocumentUrl(blobUrl);
              } catch {
                setDocumentUrl(data.signedUrl);
              }
            } else {
              setDocumentUrl(data.signedUrl);
            }
          });
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error loading invoice');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoice(); }, [id]);

  // Revoke blob URL on cleanup
  useEffect(() => {
    return () => {
      if (documentUrl?.startsWith('blob:')) URL.revokeObjectURL(documentUrl);
    };
  }, [documentUrl]);

  const startEdit = () => {
    if (!invoice) return;
    setEditData({
      vendor_name: invoice.vendor_name,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      currency: invoice.currency,
      due_date: invoice.due_date,
      description: invoice.description,
      line_items: invoice.line_items,
      subtotal: invoice.subtotal,
      vat: invoice.vat,
      total: invoice.total,
      project_id: invoice.project_id,
      category_id: invoice.category_id,
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

  const handleDelete = async () => {
    if (!invoice) return;
    const { error } = await supabase.from('invoices').delete().eq('id', invoice.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Invoice deleted' });
    navigate('/invoices');
  };

  const activityLog = invoice ? [
    { date: invoice.created_at, text: 'Invoice created' },
    ...(invoice.payment_status === 'paid' && invoice.updated_at && invoice.updated_at !== invoice.created_at
      ? [{ date: invoice.updated_at, text: 'Marked as paid' }]
      : []),
  ] : [];

  const docPath = invoice?.document_path?.toLowerCase() ?? '';
  const isPdf = docPath.endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/.test(docPath);

  if (loading) return (
    <div className="min-h-screen">
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

  if (error) return <div className="min-h-screen"><div className="container py-16 text-center text-destructive">Error: {error}</div></div>;

  if (!invoice) return <div className="min-h-screen"><div className="container py-16 text-center text-muted-foreground">Invoice not found</div></div>;

  return (
    <div className="min-h-screen">
      <div className="container space-y-6 py-8">
        <Link to="/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All Invoices</Link>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{invoice.vendor_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              #{invoice.invoice_number} &middot; {invoice.invoice_date} &middot; {invoice.currency}
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteModal(true)}><Trash2 className="mr-1 h-3.5 w-3.5" /> Delete</Button>
        </div>

        {/* Details (left) + Activity (right) */}
        <div className="grid gap-6 lg:grid-cols-[1fr,360px]">

        {/* Unified Details Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Invoice Details</CardTitle>
            {editing ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit}><Check className="mr-1 h-3.5 w-3.5" /> Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X className="mr-1 h-3.5 w-3.5" /> Cancel</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Vendor — full width, prominent */}
            <div>
              <Label className="text-xs text-muted-foreground">Vendor</Label>
              {editing ? (
                <Input
                  value={editData.vendor_name ?? ''}
                  onChange={(e) => setEditData({ ...editData, vendor_name: e.target.value })}
                  className="text-lg font-semibold"
                />
              ) : (
                <p className="text-lg font-semibold">{invoice.vendor_name || '—'}</p>
              )}
            </div>

            {/* Core fields row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-xs text-muted-foreground">Invoice #</Label>
                {editing ? (
                  <Input value={editData.invoice_number ?? ''} onChange={(e) => setEditData({ ...editData, invoice_number: e.target.value })} />
                ) : (
                  <p className="text-sm">{invoice.invoice_number || '—'}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Invoice Date</Label>
                {editing ? (
                  <Input type="date" value={editData.invoice_date ?? ''} onChange={(e) => setEditData({ ...editData, invoice_date: e.target.value })} />
                ) : (
                  <p className="text-sm">{invoice.invoice_date || '—'}</p>
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

            {/* Assignment row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-xs text-muted-foreground">Currency</Label>
                {editing ? (
                  <Select value={editData.currency ?? ''} onValueChange={(v) => setEditData({ ...editData, currency: v })}>
                    <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
                    <SelectContent>{SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{invoice.currency || '—'}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Project</Label>
                {editing ? (
                  <Select value={editData.project_id ?? ''} onValueChange={(v) => setEditData({ ...editData, project_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{(invoice as any).project?.name ?? 'Unassigned'}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Category</Label>
                {editing ? (
                  <Select value={editData.category_id?.toString() ?? ''} onValueChange={(v) => setEditData({ ...editData, category_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{(invoice as any).category?.name ?? 'Uncategorized'}</p>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              {editing ? (
                <Textarea value={editData.description ?? ''} onChange={(e) => setEditData({ ...editData, description: e.target.value })} rows={3} />
              ) : (
                <p className="text-sm">{invoice.description || '—'}</p>
              )}
            </div>

            {/* Line Items */}
            <div>
              <Label className="text-xs text-muted-foreground">Line Items</Label>
              {editing ? (
                <Textarea
                  value={Array.isArray(editData.line_items) ? JSON.stringify(editData.line_items, null, 2) : (editData.line_items ?? '')}
                  onChange={(e) => setEditData({ ...editData, line_items: e.target.value })}
                  rows={4}
                  className="font-mono text-xs"
                />
              ) : (
                <div className="text-sm">
                  {!invoice.line_items
                    ? '—'
                    : Array.isArray(invoice.line_items)
                      ? (invoice.line_items as any[]).map((item: any, i: number) =>
                          <span key={i} className="block">{item.description ?? item.item} x{item.quantity} @ {item.unit_price}</span>
                        )
                      : String(invoice.line_items)}
                </div>
              )}
            </div>

            {/* Financial summary — receipt style */}
            <div className="border-t pt-4 mt-4">
              {editing ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4"><span className="text-sm text-muted-foreground">Subtotal</span><Input type="number" step="0.01" className="w-32 text-right" value={editData.subtotal ?? ''} onChange={(e) => setEditData({ ...editData, subtotal: parseFloat(e.target.value) || 0 })} /></div>
                  <div className="flex items-center justify-between gap-4"><span className="text-sm text-muted-foreground">VAT</span><Input type="number" step="0.01" className="w-32 text-right" value={editData.vat ?? ''} onChange={(e) => setEditData({ ...editData, vat: parseFloat(e.target.value) || 0 })} /></div>
                  <div className="flex items-center justify-between gap-4 border-t pt-2 mt-2"><span className="text-sm font-bold">Total</span><Input type="number" step="0.01" className="w-32 text-right font-bold" value={editData.total ?? ''} onChange={(e) => setEditData({ ...editData, total: parseFloat(e.target.value) || 0 })} /></div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(invoice.subtotal ?? 0, invoice.currency ?? 'EUR')}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">VAT</span><span>{formatCurrency(invoice.vat ?? 0, invoice.currency ?? 'EUR')}</span></div>
                  <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                    <span>Total</span>
                    <span className="flex items-baseline gap-1.5">
                      {formatCurrency(invoice.total ?? 0, invoice.currency ?? 'EUR')}
                      {invoice.currency && invoice.currency !== baseCurrency && (
                        <span className="text-xs font-normal text-muted-foreground">
                          ≈ {formatCurrency(convertToBase(invoice.total ?? 0, invoice.currency, rates), baseCurrency)}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Activity Log — right column */}
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

        </div>{/* end grid */}

        {/* Document viewer — AT THE BOTTOM */}
        {invoice.document_path && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" /> Attachment
              </CardTitle>
              {downloadUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={downloadUrl} target="_blank" rel="noopener noreferrer"><Download className="mr-1 h-4 w-4" /> Download</a>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isPdf && documentUrl ? (
                <iframe
                  src={`${documentUrl}#toolbar=0&navpanes=0&view=FitH`}
                  className="h-[700px] w-full rounded-lg border"
                  title="Invoice PDF"
                />
              ) : isImage && documentUrl ? (
                <img
                  src={documentUrl}
                  alt="Invoice attachment"
                  className="max-w-full rounded-lg border"
                />
              ) : documentUrl ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
                  <Button variant="outline" size="sm" asChild>
                    <a href={downloadUrl ?? documentUrl} target="_blank" rel="noopener noreferrer"><Download className="mr-1 h-4 w-4" /> Download File</a>
                  </Button>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">Unable to load document. The file may have been moved or is unavailable.</p>
              )}
            </CardContent>
          </Card>
        )}

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
