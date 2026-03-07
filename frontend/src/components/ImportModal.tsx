import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Upload, FileText, Table, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';
const ACCEPTED_EXTS = '.pdf,.jpg,.jpeg,.png,.webp';
const STORAGE_BUCKET = 'invoices-bucket';

// ── Image → PDF conversion ────────────────────────────────────────────────────

async function imageToPdf(file: File): Promise<File> {
  const { jsPDF } = await import('jspdf');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({
    orientation: bitmap.width > bitmap.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [bitmap.width, bitmap.height],
  });
  pdf.addImage(dataUrl, 'JPEG', 0, 0, bitmap.width, bitmap.height);
  const blob = pdf.output('blob');
  const pdfName = file.name.replace(/\.[^.]+$/, '.pdf');
  return new File([blob], pdfName, { type: 'application/pdf' });
}

async function prepareFiles(rawFiles: File[]): Promise<File[]> {
  const accepted = rawFiles.filter(f =>
    /\.(pdf|jpe?g|png|webp)$/i.test(f.name) || f.type === 'application/pdf' || f.type.startsWith('image/')
  );
  const prepared: File[] = [];
  for (const f of accepted) {
    if (f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name)) {
      prepared.push(await imageToPdf(f));
    } else {
      prepared.push(f);
    }
  }
  return prepared;
}

// ── CSV column auto-mapping ───────────────────────────────────────────────────

const AUTO_MAP: Record<string, string> = {
  vendor: 'vendor_name', supplier: 'vendor_name', vendor_name: 'vendor_name', company: 'vendor_name',
  date: 'invoice_date', invoice_date: 'invoice_date', 'invoice date': 'invoice_date',
  due_date: 'due_date', 'due date': 'due_date', 'payment due': 'due_date',
  invoice_number: 'invoice_number', 'invoice number': 'invoice_number', 'invoice #': 'invoice_number',
  ref: 'invoice_number', reference: 'invoice_number',
  total: 'total', amount: 'total', 'total amount': 'total', 'invoice total': 'total',
  subtotal: 'subtotal', 'sub total': 'subtotal', 'net amount': 'subtotal',
  vat: 'vat', tax: 'vat', 'vat amount': 'vat',
  currency: 'currency',
  description: 'description', notes: 'description', memo: 'description',
};

const FIELD_OPTIONS = [
  { value: 'vendor_name',    label: 'Vendor' },
  { value: 'invoice_date',   label: 'Invoice Date (YYYY-MM-DD)' },
  { value: 'due_date',       label: 'Due Date (YYYY-MM-DD)' },
  { value: 'invoice_number', label: 'Invoice Number' },
  { value: 'total',          label: 'Total' },
  { value: 'subtotal',       label: 'Subtotal' },
  { value: 'vat',            label: 'VAT / Tax' },
  { value: 'currency',       label: 'Currency (GBP, USD…)' },
  { value: 'description',    label: 'Description' },
  { value: 'skip',           label: '— Skip column —' },
];

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  return { headers: splitCsvLine(lines[0]), rows: lines.slice(1).map(splitCsvLine) };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  projectId?: string;
}

export const ImportModal = ({ open, onClose, onImported, projectId }: Props) => {
  const { session, user } = useAuth();

  // ── Queue state ────────────────────────────────────────────────────────────
  const [queue, setQueue] = useState<File[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [converting, setConverting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // ── Per-file extraction state ──────────────────────────────────────────────
  const [extracting, setExtracting] = useState(false);
  const [invoiceData, setInvoiceData] = useState<Record<string, any> | null>(null);
  const [editFields, setEditFields] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  // ── Reference data ────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  // ── CSV state ──────────────────────────────────────────────────────────────
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvInserting, setCsvInserting] = useState(false);
  const [csvInserted, setCsvInserted] = useState<number | null>(null);

  const authHeader = () =>
    session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

  // ── Load projects & categories ────────────────────────────────────────────
  useEffect(() => {
    if (!open || !user) return;
    const load = async () => {
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from('projects').select('id, name').eq('user_id', user.id).eq('status', 'Active'),
        supabase.from('invoice_categories').select('id, name'),
      ]);
      setProjects(p ?? []);
      setCategories(c ?? []);
    };
    load();
  }, [open, user]);

  // ── File intake (drag-drop or click) ──────────────────────────────────────

  const handleFiles = async (rawFiles: FileList | File[]) => {
    const files = Array.from(rawFiles);
    if (!files.length) return;

    setConverting(true);
    setInvoiceData(null);
    setEditFields({});

    let prepared: File[] = [];
    try {
      prepared = await prepareFiles(files);
    } catch {
      toast({ title: 'Conversion failed', description: 'Could not convert one or more images.', variant: 'destructive' });
    }
    setConverting(false);

    if (!prepared.length) {
      toast({ title: 'No valid files', description: 'Please upload PDF, JPG, PNG, or WebP files.', variant: 'destructive' });
      return;
    }

    setQueue(prepared);
    setQueueIdx(0);
    extractFile(prepared, 0);
  };

  // ── Extract file (single LLM call + vendor lookup) ─────────────────────────

  const extractFile = async (files: File[], idx: number) => {
    const file = files[idx];
    if (!file || !user) return;
    setExtracting(true);
    setInvoiceData(null);
    setEditFields({});

    try {
      const storagePath = `${user.id}/imports/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, { upsert: true });
      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

      // Single LLM call for extraction + deterministic vendor lookup
      const resp = await fetch(`${BACKEND}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ attachment_path: storagePath }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail ?? 'Extraction failed');

      if (data.error || data.not_invoice) {
        toast({
          title: 'Skipped',
          description: data.error ?? 'This file does not appear to be an invoice.',
        });
        advanceOrClose(files, idx);
        return;
      }

      // Show review form with extracted data + vendor-mapped suggestions
      setInvoiceData({ storagePath, ...data });
      setEditFields({
        vendor_name: data.vendor_name ?? '',
        invoice_number: data.invoice_number ?? '',
        invoice_date: data.invoice_date ?? '',
        due_date: data.due_date ?? '',
        currency: data.currency ?? '',
        subtotal: data.subtotal ?? '',
        vat: data.vat ?? '',
        total: data.total ?? '',
        description: data.description ?? '',
        project_id: data.suggested_project_id ?? '',
        category_id: data.suggested_category_id ?? '',
      });
    } catch (e: any) {
      toast({ title: 'Extraction failed', description: e.message, variant: 'destructive' });
    } finally {
      setExtracting(false);
    }
  };

  // ── Save edits to invoice ──────────────────────────────────────────────────

  const handleSaveInvoice = async () => {
    if (!invoiceData || !user) return;
    setSaving(true);
    try {
      const record: Record<string, any> = {
        user_id: user.id,
        vendor_name: editFields.vendor_name || null,
        invoice_number: editFields.invoice_number || null,
        invoice_date: editFields.invoice_date || null,
        due_date: editFields.due_date || null,
        currency: editFields.currency || null,
        subtotal: editFields.subtotal ? Number(editFields.subtotal) : null,
        vat: editFields.vat ? Number(editFields.vat) : null,
        total: editFields.total ? Number(editFields.total) : null,
        description: editFields.description || null,
        project_id: editFields.project_id || null,
        category_id: editFields.category_id || null,
        document_path: invoiceData.storagePath ?? invoiceData.document_path ?? null,
        document_hash: invoiceData.document_hash ?? null,
        line_items: invoiceData.line_items ?? null,
        payment_status: 'unpaid',
      };
      const { error } = await supabase.from('invoices').insert(record);
      if (error) throw new Error(error.message);

      // Upsert vendor mapping for future auto-assignment
      if (record.vendor_name && (record.project_id || record.category_id)) {
        await supabase.from('vendor_mappings').upsert(
          {
            user_id: user.id,
            vendor_name: record.vendor_name,
            project_id: record.project_id,
            category_id: record.category_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,vendor_name' }
        );
      }

      onImported();
      advanceOrClose(queue, queueIdx, 'Invoice saved.');
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const advanceOrClose = (files: File[], idx: number, _savedMsg?: string) => {
    const nextIdx = idx + 1;
    if (nextIdx < files.length) {
      setQueueIdx(nextIdx);
      extractFile(files, nextIdx);
    } else {
      handleClose();
    }
  };

  const handleSkip = () => {
    setInvoiceData(null);
    setEditFields({});
    advanceOrClose(queue, queueIdx);
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  // ── CSV ────────────────────────────────────────────────────────────────────

  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers, rows } = parseCsv(e.target?.result as string);
      setCsvHeaders(headers);
      setCsvRows(rows);
      const mapping: Record<string, string> = {};
      headers.forEach(h => { mapping[h] = AUTO_MAP[h.toLowerCase().trim()] ?? 'skip'; });
      setCsvMapping(mapping);
      setCsvInserted(null);
    };
    reader.readAsText(file);
  };

  const handleCsvImport = async () => {
    setCsvInserting(true);
    let inserted = 0;

    for (const row of csvRows) {
      const record: Record<string, any> = { user_id: user?.id, project_id: projectId ?? null, payment_status: 'unpaid', processing_status: 'complete' };
      csvHeaders.forEach((h, i) => {
        const f = csvMapping[h];
        if (f && f !== 'skip' && row[i]) record[f] = row[i];
      });
      if (!record.vendor_name) continue;
      if (record.total) record.total = Number(record.total) || null;
      if (record.subtotal) record.subtotal = Number(record.subtotal) || null;
      if (record.vat) record.vat = Number(record.vat) || null;
      const { error } = await supabase.from('invoices').insert(record);
      if (!error) inserted++;
    }

    setCsvInserting(false);
    setCsvInserted(inserted);

    if (inserted > 0) {
      toast({ title: `${inserted} invoice${inserted !== 1 ? 's' : ''} imported` });
      onImported();
    } else {
      toast({ title: 'No invoices imported', description: 'Check your column mapping and ensure Vendor is mapped.', variant: 'destructive' });
    }
  };

  // ── Reset & close ──────────────────────────────────────────────────────────

  const handleClose = () => {
    setQueue([]); setQueueIdx(0);
    setInvoiceData(null); setEditFields({});
    setCsvHeaders([]); setCsvRows([]); setCsvMapping({}); setCsvInserted(null);
    onClose();
  };

  // ── Field helper ───────────────────────────────────────────────────────────

  const field = (key: string, label: string, halfWidth = false) => (
    <div className={halfWidth ? 'flex-1 min-w-0' : 'w-full'}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        value={editFields[key] ?? ''}
        onChange={(e) => setEditFields({ ...editFields, [key]: e.target.value })}
        className="mt-1"
      />
    </div>
  );

  // ── Drop zone content ──────────────────────────────────────────────────────

  const dropZoneContent = () => {
    if (converting) return (
      <>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm font-medium">Converting images to PDF…</p>
      </>
    );

    if (queue.length > 0 && !invoiceData) return (
      <>
        <FileText className="h-8 w-8 text-primary" />
        <p className="text-sm font-medium">
          {queue.length} file{queue.length > 1 ? 's' : ''} queued
        </p>
        <div className="mt-1 max-h-20 w-full overflow-y-auto space-y-0.5 text-xs text-muted-foreground">
          {queue.map((f, i) => (
            <div key={i} className={cn('flex items-center gap-1.5 px-1', i < queueIdx && 'opacity-40 line-through')}>
              {i < queueIdx
                ? <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                : i === queueIdx
                  ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
                  : <div className="h-3 w-3 shrink-0 rounded-full border border-muted-foreground/40" />}
              <span className="truncate">{f.name}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Click to replace with new files</p>
      </>
    );

    return (
      <>
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Drag & drop or click to choose</p>
        <p className="text-xs text-muted-foreground">PDF, JPG, PNG, WebP · multiple files OK</p>
      </>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Invoices</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="pdf">
          <TabsList className="w-full">
            <TabsTrigger value="pdf" className="flex-1">
              <FileText className="mr-2 h-4 w-4" /> PDF / Image
            </TabsTrigger>
            <TabsTrigger value="csv" className="flex-1">
              <Table className="mr-2 h-4 w-4" /> CSV / Spreadsheet
            </TabsTrigger>
          </TabsList>

          {/* ── PDF tab ──────────────────────────────────────── */}
          <TabsContent value="pdf" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Upload PDFs or images — we'll extract the details automatically. Drop multiple files to process them in sequence.
            </p>

            {/* Drop zone — hide when showing review form */}
            {!invoiceData && (
              <label
                htmlFor="pdf-upload"
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors',
                  isDragging ? 'border-primary bg-primary/5' : 'hover:bg-secondary/40',
                )}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                {dropZoneContent()}
                <input
                  id="pdf-upload"
                  type="file"
                  accept={ACCEPTED_EXTS}
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
                />
              </label>
            )}

            {/* Progress indicator */}
            {queue.length > 1 && !invoiceData && (
              <p className="text-center text-xs text-muted-foreground">
                File {queueIdx + 1} of {queue.length}
              </p>
            )}

            {/* Processing state */}
            {extracting && (
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="font-medium">Extracting invoice data…</p>
              </div>
            )}

            {/* ── Review form ──────────────────────────────────── */}
            {invoiceData && !extracting && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Invoice processed — review & confirm details
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex gap-3">
                    {field('vendor_name', 'Vendor', true)}
                    {field('invoice_number', 'Invoice #', true)}
                  </div>
                  <div className="flex gap-3">
                    {field('invoice_date', 'Date', true)}
                    {field('due_date', 'Due Date', true)}
                  </div>
                  <div className="flex gap-3">
                    {field('currency', 'Currency', true)}
                    {field('subtotal', 'Subtotal', true)}
                  </div>
                  <div className="flex gap-3">
                    {field('vat', 'VAT', true)}
                    {field('total', 'Total', true)}
                  </div>
                  {field('description', 'Description')}

                  {/* Project assignment */}
                  <div className="flex gap-3">
                    <div className="flex-1 min-w-0">
                      <label className="text-xs font-medium text-muted-foreground">Project</label>
                      <Select
                        value={editFields.project_id ?? ''}
                        onValueChange={(v) => setEditFields({ ...editFields, project_id: v === '_none' ? '' : v })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Unassigned</SelectItem>
                          {projects.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex-1 min-w-0">
                      <label className="text-xs font-medium text-muted-foreground">Category</label>
                      <Select
                        value={editFields.category_id ?? ''}
                        onValueChange={(v) => setEditFields({ ...editFields, category_id: v === '_none' ? '' : v })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Unassigned</SelectItem>
                          {categories.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveInvoice} disabled={saving} className="flex-1">
                    {saving
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                      : 'Save Invoice'}
                  </Button>
                  {queue.length > 1 && (
                    <Button variant="outline" onClick={handleSkip}>Skip</Button>
                  )}
                </div>
              </div>
            )}

            {/* Empty state — no file yet */}
            {!extracting && !invoiceData && queue.length === 0 && !converting && (
              <p className="text-center text-xs text-muted-foreground py-2">
                No file selected yet.
              </p>
            )}
          </TabsContent>

          {/* ── CSV tab ──────────────────────────────────────── */}
          <TabsContent value="csv" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV exported from Excel, FreeAgent, Xero, QuickBooks, etc. Map the columns below.
            </p>

            <label
              htmlFor="csv-upload"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors hover:bg-secondary/40"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                {csvHeaders.length
                  ? `${csvRows.length} row${csvRows.length !== 1 ? 's' : ''} detected`
                  : 'Click to choose CSV'}
              </p>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }}
              />
            </label>

            {csvHeaders.length > 0 && (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Map columns</p>
                  {csvHeaders.map(h => (
                    <div key={h} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 truncate text-sm text-muted-foreground">{h}</span>
                      <span className="text-muted-foreground">&rarr;</span>
                      <Select
                        value={csvMapping[h] ?? 'skip'}
                        onValueChange={(v) => setCsvMapping({ ...csvMapping, [h]: v })}
                      >
                        <SelectTrigger className="h-8 flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  {csvRows.length} invoice{csvRows.length !== 1 ? 's' : ''} ready to import
                  {' '}&mdash; rows without a Vendor value will be skipped.
                </p>

                {csvInserted !== null ? (
                  <div className="space-y-2">
                    <p className="text-center text-sm font-medium text-green-600">
                      {csvInserted} invoice{csvInserted !== 1 ? 's' : ''} imported
                    </p>
                    <Button variant="outline" className="w-full" onClick={handleClose}>Done</Button>
                  </div>
                ) : (
                  <Button onClick={handleCsvImport} disabled={csvInserting} className="w-full">
                    {csvInserting
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…</>
                      : `Import ${csvRows.length} Invoice${csvRows.length !== 1 ? 's' : ''}`}
                  </Button>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
