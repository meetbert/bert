import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Project, Category } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

const CURRENCIES = ['GBP', 'EUR', 'USD', 'CAD', 'AUD', 'CHF', 'JPY', 'NOK', 'SEK', 'DKK'];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  projects: Project[];
  categories: Category[];
  defaultCurrency?: string;
}

export function CreateInvoiceDialog({ open, onClose, onCreated, projects, categories, defaultCurrency = 'GBP' }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    vendor_name: '',
    invoice_number: '',
    invoice_date: '',
    due_date: '',
    currency: defaultCurrency,
    subtotal: '',
    vat: '',
    total: '',
    description: '',
    project_id: '',
    category_id: '',
    payment_status: 'unpaid',
  });

  const set = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.vendor_name.trim()) {
      toast({ title: 'Vendor name is required', variant: 'destructive' });
      return;
    }
    if (!form.total) {
      toast({ title: 'Total amount is required', variant: 'destructive' });
      return;
    }
    if (!user) return;

    setSaving(true);
    const { error } = await supabase.from('invoices').insert({
      user_id: user.id,
      vendor_name: form.vendor_name.trim(),
      invoice_number: form.invoice_number.trim() || null,
      invoice_date: form.invoice_date || null,
      due_date: form.due_date || null,
      currency: form.currency,
      subtotal: form.subtotal ? parseFloat(form.subtotal) : null,
      vat: form.vat ? parseFloat(form.vat) : null,
      total: parseFloat(form.total),
      description: form.description.trim() || null,
      project_id: form.project_id || null,
      category_id: form.category_id || null,
      payment_status: form.payment_status,
      processing_status: 'complete',
    });
    setSaving(false);

    if (error) {
      toast({ title: 'Failed to create invoice', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Invoice created' });
    setForm({
      vendor_name: '', invoice_number: '', invoice_date: '', due_date: '',
      currency: defaultCurrency, subtotal: '', vat: '', total: '',
      description: '', project_id: '', category_id: '', payment_status: 'unpaid',
    });
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Vendor + Invoice # */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vendor <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Arri UK" value={form.vendor_name} onChange={(e) => set('vendor_name', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice #</Label>
              <Input placeholder="e.g. INV-001" value={form.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Invoice Date</Label>
              <Input type="date" value={form.invoice_date} onChange={(e) => set('invoice_date', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
            </div>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subtotal</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.subtotal} onChange={(e) => set('subtotal', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>VAT</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.vat} onChange={(e) => set('vat', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Total <span className="text-destructive">*</span></Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.total} onChange={(e) => set('total', e.target.value)} />
            </div>
          </div>

          {/* Project + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={form.project_id || 'none'} onValueChange={(v) => set('project_id', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.filter((p) => p.status === 'Active').map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category_id || 'none'} onValueChange={(v) => set('category_id', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Payment Status</Label>
            <Select value={form.payment_status} onValueChange={(v) => set('payment_status', v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea placeholder="What was this invoice for?" value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Create Invoice'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
