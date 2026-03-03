import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Upload, FileText, Table, Loader2 } from 'lucide-react';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';
const ACCEPTED_FILES = '.pdf,.jpg,.jpeg,.png,.webp';
const STORAGE_BUCKET = 'invoices-bucket';

// ── CSV column auto-mapping ──────────────────────────────────────────────────

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

// ── CSV helpers ──────────────────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export const ImportModal = ({ open, onClose, onImported }: Props) => {
  const { session, user } = useAuth();

  // ── PDF state ──────────────────────────────────────────────────────────────
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Record<string, any> | null>(null);
  const [editFields, setEditFields] = useState<Record<string, any>>({});
  const [inserting, setInserting] = useState(false);

  // ── CSV state ──────────────────────────────────────────────────────────────
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvInserting, setCsvInserting] = useState(false);
  const [csvInserted, setCsvInserted] = useState<number | null>(null);

  const authHeader = () =>
    session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

  // ── PDF: upload to storage → extract → show preview ────────────────────────

  const handleExtract = async () => {
    if (!pdfFile || !user) return;
    setExtracting(true);

    try {
      // 1. Upload to Supabase Storage
      const storagePath = `${user.id}/imports/${Date.now()}_${pdfFile.name}`;
      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, pdfFile, { upsert: true });

      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

      // 2. Call backend extraction
      const resp = await fetch(`${BACKEND}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ attachment_path: storagePath }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail ?? 'Extraction failed');
      if (data.not_invoice) throw new Error('This file does not appear to be an invoice.');

      // 3. Store extracted data + storage path for later insert
      setExtracted({ ...data, document_path: storagePath });
      setEditFields({ ...data, document_path: storagePath });
    } catch (e: any) {
      toast({ title: 'Extraction failed', description: e.message, variant: 'destructive' });
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirmInsert = async () => {
    if (!user) return;
    setInserting(true);

    try {
      const { error } = await supabase.from('invoices').insert({
        user_id: user.id,
        vendor_name: editFields.vendor_name || null,
        invoice_date: editFields.invoice_date || null,
        invoice_number: editFields.invoice_number || null,
        currency: editFields.currency || null,
        subtotal: editFields.subtotal ? Number(editFields.subtotal) : null,
        vat: editFields.vat ? Number(editFields.vat) : null,
        total: editFields.total ? Number(editFields.total) : null,
        due_date: editFields.due_date || null,
        description: editFields.description || null,
        line_items: editFields.line_items || null,
        document_path: editFields.document_path || null,
        document_hash: editFields.document_hash || null,
        payment_status: 'unpaid',
        processing_status: 'complete',
      });

      if (error) throw new Error(error.message);
      toast({ title: 'Invoice imported', description: `${editFields.vendor_name ?? 'Invoice'} added successfully.` });
      onImported();
      handleClose();
    } catch (e: any) {
      toast({ title: 'Insert failed', description: e.message, variant: 'destructive' });
    } finally {
      setInserting(false);
    }
  };

  // ── CSV: parse → map → insert ──────────────────────────────────────────────

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
      const record: Record<string, any> = { user_id: user?.id, payment_status: 'unpaid', processing_status: 'complete' };
      csvHeaders.forEach((h, i) => {
        const field = csvMapping[h];
        if (field && field !== 'skip' && row[i]) record[field] = row[i];
      });
      if (!record.vendor_name) continue;

      // Coerce numeric fields
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
    setPdfFile(null); setExtracted(null); setEditFields({});
    setCsvHeaders([]); setCsvRows([]); setCsvMapping({}); setCsvInserted(null);
    onClose();
  };

  // ── Editable field helper ──────────────────────────────────────────────────

  const field = (key: string, label: string) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={editFields[key] ?? ''}
        onChange={(e) => setEditFields({ ...editFields, [key]: e.target.value })}
        className="h-8 text-sm"
      />
    </div>
  );

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

          {/* ── PDF tab ─────────────────────────────────────── */}
          <TabsContent value="pdf" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Upload a PDF or image invoice. We'll extract the details automatically — review before saving.
            </p>

            <label
              htmlFor="pdf-upload"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors hover:bg-secondary/40"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                {pdfFile ? pdfFile.name : 'Click to choose file'}
              </p>
              <p className="text-xs text-muted-foreground">PDF, JPG, PNG, WebP</p>
              <input
                id="pdf-upload"
                type="file"
                accept={ACCEPTED_FILES}
                className="hidden"
                onChange={(e) => { setPdfFile(e.target.files?.[0] ?? null); setExtracted(null); setEditFields({}); }}
              />
            </label>

            {!extracted && (
              <Button onClick={handleExtract} disabled={!pdfFile || extracting} className="w-full">
                {extracting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Extracting...</> : 'Extract Invoice Data'}
              </Button>
            )}

            {extracted && (
              <>
                <div className="grid grid-cols-2 gap-3 rounded-lg border p-4">
                  {field('vendor_name', 'Vendor')}
                  {field('invoice_number', 'Invoice #')}
                  {field('invoice_date', 'Date')}
                  {field('due_date', 'Due Date')}
                  {field('currency', 'Currency')}
                  {field('subtotal', 'Subtotal')}
                  {field('vat', 'VAT')}
                  {field('total', 'Total')}
                  <div className="col-span-2">{field('description', 'Description')}</div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleConfirmInsert} disabled={inserting} className="flex-1">
                    {inserting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save Invoice'}
                  </Button>
                  <Button variant="outline" onClick={() => { setPdfFile(null); setExtracted(null); setEditFields({}); }}>
                    Start Over
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── CSV tab ─────────────────────────────────────── */}
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
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</>
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
