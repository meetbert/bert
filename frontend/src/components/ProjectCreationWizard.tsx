import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

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
  return new File([blob], file.name.replace(/\.[^.]+$/, '.pdf'), { type: 'application/pdf' });
}

async function prepareFiles(rawFiles: File[]): Promise<File[]> {
  const prepared: File[] = [];
  for (const f of rawFiles) {
    if (f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name)) {
      prepared.push(await imageToPdf(f));
    } else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      prepared.push(f);
    }
  }
  return prepared;
}
import { Textarea } from '@/components/ui/textarea';
import { Category } from '@/types/database';
import { useDemoData } from '@/contexts/DemoDataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { Plus, FileText, X, Upload, Loader2, ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { formatCurrency } from '@/lib/currency';

interface WizardProps {
  onComplete: (projectId: string) => void;
  onCancel?: () => void;
  showProgress?: boolean;
}

export const ProjectCreationWizard = ({
  onComplete,
  onCancel,
  showProgress = true,
}: WizardProps) => {
  const { user, session } = useAuth();
  const { isDemoMode, demoCategories, addDemoProject, addDemoProjectCategories, addDemoCategory, addDemoProjectDocs } = useDemoData();
  const { baseCurrency } = useUserSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [demoExtracted, setDemoExtracted] = useState(false);

  // Step 1 — Brief + Project Details
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [knownVendors, setKnownVendors] = useState('');
  const [knownLocations, setKnownLocations] = useState('');

  // Step 2 — Categories & Budgets
  const [budgetMode, setBudgetMode] = useState<'total' | 'category'>('total');
  const [manualBudget, setManualBudget] = useState('');
  const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Map<string, number>>(new Map());
  const [newCategoryName, setNewCategoryName] = useState('');

  const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';

  useEffect(() => {
    if (isDemoMode) {
      setAvailableCategories([...demoCategories].sort((a, b) => a.name.localeCompare(b.name)));
      return;
    }
    supabase
      .from('invoice_categories')
      .select('*')
      .order('name')
      .then(({ data }) => setAvailableCategories(data ?? []));
  }, [isDemoMode]);

  const totalBudget = Array.from(selectedCategories.values()).reduce((sum, b) => sum + b, 0);

  // ── Brief extraction ──────────────────────────────────────────────

  const DEMO_BRIEF = {
    name: 'Coastal Horizons Documentary',
    description: 'A feature-length documentary following fishing communities along the Atlantic coast, exploring the intersection of tradition and climate change. Principal photography across three locations over six weeks.',
    known_vendors: 'Lens & Light Equipment Co, Northern Drone Services, Pinewood Catering Ltd, Studio X Post Production',
    known_locations: 'Porto, Lisbon, Galicia',
  };

  const extractFromFile = async (file: File) => {
    setExtracting(true);

    if (isDemoMode) {
      await new Promise(r => setTimeout(r, 2000));
      if (!name.trim()) setName(DEMO_BRIEF.name);
      setDescription(prev => prev.trim() ? prev : DEMO_BRIEF.description);
      setKnownVendors(DEMO_BRIEF.known_vendors);
      setKnownLocations(DEMO_BRIEF.known_locations);
      toast({ title: 'Brief extracted', description: 'Project details filled in below — review and edit as needed.' });
      setDemoExtracted(true);
      setExtracting(false);
      return;
    }

    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await fetch(`${BACKEND}/api/projects/extract-context`, {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: form,
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.name && !name.trim()) setName(json.name);
        if (json.description) setDescription((prev) => prev.trim() ? prev : json.description);
        if (json.known_vendors?.length) setKnownVendors(json.known_vendors.join(', '));
        if (json.known_locations?.length) setKnownLocations(json.known_locations.join(', '));
        toast({ title: 'Brief extracted', description: 'Project details filled in below — review and edit as needed.' });
      } else {
        toast({ title: 'Extraction failed', description: 'Could not read the brief. Fill in details manually.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Extraction failed', description: 'Could not reach the backend.', variant: 'destructive' });
    }
    setExtracting(false);
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const raw = Array.from(e.target.files);
    e.target.value = '';
    setConverting(true);
    const files = await prepareFiles(raw);
    setConverting(false);
    if (!files.length) return;
    setPendingFiles((prev) => [...prev, ...files]);
    if (files[0]) extractFromFile(files[0]);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (extracting || converting) return;
    const raw = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(pdf|jpe?g|png|webp)$/i.test(f.name),
    );
    if (!raw.length) return;
    setConverting(true);
    const files = await prepareFiles(raw);
    setConverting(false);
    if (!files.length) return;
    setPendingFiles((prev) => [...prev, ...files]);
    if (files[0]) extractFromFile(files[0]);
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Category helpers ──────────────────────────────────────────────

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, 0);
      return next;
    });
  };

  const setCategoryBudget = (id: string, amount: number) => {
    setSelectedCategories((prev) => {
      const next = new Map(prev);
      next.set(id, amount);
      return next;
    });
  };

  const addCustomCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    if (isDemoMode) {
      const cat = addDemoCategory(trimmed);
      setAvailableCategories(prev => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCategories(prev => { const next = new Map(prev); next.set(cat.id, 0); return next; });
      setNewCategoryName('');
      return;
    }

    const { data, error } = await supabase
      .from('invoice_categories')
      .insert({ name: trimmed })
      .select('id, name')
      .single();

    if (error) {
      const { data: existing } = await supabase
        .from('invoice_categories')
        .select('id, name')
        .eq('name', trimmed)
        .single();
      if (existing) {
        if (!availableCategories.find((c) => c.id === existing.id))
          setAvailableCategories((prev) => [...prev, existing]);
        setSelectedCategories((prev) => {
          const next = new Map(prev);
          if (!next.has(existing.id)) next.set(existing.id, 0);
          return next;
        });
        setNewCategoryName('');
        return;
      }
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    if (data) {
      setAvailableCategories((prev) => [...prev, data]);
      setSelectedCategories((prev) => {
        const next = new Map(prev);
        next.set(data.id, 0);
        return next;
      });
      setNewCategoryName('');
    }
  };

  // ── Create project ────────────────────────────────────────────────

  const handleCreateProject = async () => {
    setSubmitting(true);

    if (isDemoMode) {
      const parseList = (text: string) => text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      const newId = `demo-proj-${Date.now()}`;
      addDemoProject({
        id: newId,
        name: name.trim(),
        description: description.trim() || null,
        status: 'Active',
        budget: budgetMode === 'total' ? (parseFloat(manualBudget) || 0) : totalBudget,
        known_vendors: parseList(knownVendors),
        known_locations: parseList(knownLocations),
        ai_context: null,
        created_at: new Date().toISOString().split('T')[0],
      });
      if (selectedCategories.size > 0) {
        addDemoProjectCategories(
          Array.from(selectedCategories.entries()).map(([categoryId, budget]) => ({
            project_id: newId,
            category_id: categoryId,
            budget,
          }))
        );
      }
      if (pendingFiles.length > 0) {
        await addDemoProjectDocs(newId, pendingFiles);
      }
      toast({ title: 'Project created', description: `"${name}" is ready.` });
      setSubmitting(false);
      onComplete(newId);
      return;
    }

    if (!user) { setSubmitting(false); return; }

    try {
      const parseList = (text: string) => text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          known_vendors: parseList(knownVendors),
          known_locations: parseList(knownLocations),
          status: 'Active',
          budget: budgetMode === 'total' ? (parseFloat(manualBudget) || 0) : totalBudget,
          user_id: user.id,
        })
        .select('id')
        .single();

      if (projectError) throw projectError;
      const projectId = project.id;

      if (selectedCategories.size > 0) {
        const rows = Array.from(selectedCategories.entries()).map(([categoryId, budget]) => ({
          project_id: projectId,
          category_id: categoryId,
          budget,
        }));
        const { error: catError } = await supabase.from('project_categories').insert(rows);
        if (catError) throw catError;
      }

      for (const file of pendingFiles) {
        const storagePath = `${user.id}/${projectId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('project-documents-bucket')
          .upload(storagePath, file);
        if (uploadError) throw uploadError;

        const { error: docError } = await supabase
          .from('project_documents')
          .insert({ project_id: projectId, file_name: file.name, storage_path: storagePath });
        if (docError) throw docError;
      }

      toast({ title: 'Project created', description: `"${name}" is ready.` });
      onComplete(projectId);
    } catch (err: any) {
      toast({ title: 'Error creating project', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {showProgress && <Progress value={(step / 2) * 100} className="mb-2" />}

      {/* ── Step 1: Brief + Project Details ──────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Upload a Project Brief</h3>
            <p className="text-sm text-muted-foreground">
              Upload a brief, budget, or script and we'll fill in the details automatically — or skip and fill them in manually.
            </p>
          </div>

          {/* Upload area */}
          <div
            className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
            }`}
            onClick={() => !extracting && !converting && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!extracting && !converting) setIsDragging(true); }}
            onDragEnter={(e) => { e.preventDefault(); if (!extracting && !converting) setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            {(converting || extracting) ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-7 w-7 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">{converting ? 'Converting to PDF…' : 'Extracting project details…'}</p>
              </div>
            ) : (
              <>
                <Upload className="mx-auto h-7 w-7 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-2">Click to upload a brief, budget, or script</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  Choose File
                </Button>
              </>
            )}
          </div>

          {/* File list */}
          {pendingFiles.length > 0 && (
            <div className="space-y-1.5">
              {pendingFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 text-sm truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => removeFile(i)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Project Details */}
          <div className="space-y-2 pt-1">
            <Label>Project Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My First Production"
              autoFocus={pendingFiles.length === 0}
            />
          </div>

          <div className="space-y-2">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project?"
              className="min-h-[72px] resize-none text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Known Vendors <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={knownVendors}
              onChange={(e) => setKnownVendors(e.target.value)}
              placeholder="e.g. ACME Productions, Studio X, Catering Co"
              className="min-h-[56px] resize-none text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Known Locations <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={knownLocations}
              onChange={(e) => setKnownLocations(e.target.value)}
              placeholder="e.g. Wales, Pembrokeshire, Tenby, Brides Glen, Pinewood Studios"
              className="min-h-[56px] resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">Add nearby towns, villages, and venues — not just the main location. Receipts from local restaurants, shops, and suppliers will be matched against these.</p>
          </div>

          {isDemoMode ? (
            demoExtracted && (
              <div className="flex items-start gap-2 rounded-md border bg-muted/60 px-3 py-2.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">These are sample details filled in for the demo. In your live account, Bert reads your actual brief and extracts the details accurately.</p>
              </div>
            )
          ) : (
            <p className="text-xs text-muted-foreground">The description, vendors, and locations above are all seen by the AI when assigning invoices and answering questions about this project.</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>Cancel</Button>
            )}
            <Button onClick={() => setStep(2)} disabled={!name.trim() || extracting || converting}>
              Next <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Categories & Budgets ─────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Categories & Budgets</h3>
            <p className="text-sm text-muted-foreground">
              Select expense categories and set a budget — either as one total or split by category.
            </p>
          </div>

          {/* Budget mode toggle */}
          <div className="flex rounded-md border overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setBudgetMode('total')}
              className={`flex-1 py-1.5 text-center transition-colors ${budgetMode === 'total' ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-secondary/50'}`}
            >
              Total budget
            </button>
            <button
              type="button"
              onClick={() => setBudgetMode('category')}
              className={`flex-1 py-1.5 text-center transition-colors border-l ${budgetMode === 'category' ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-secondary/50'}`}
            >
              By category
            </button>
          </div>

          {budgetMode === 'total' && (
            <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
              <span className="flex-1 text-sm text-muted-foreground">Total budget</span>
              <span className="text-xs text-muted-foreground">{baseCurrency}</span>
              <Input
                type="number"
                min="0"
                step="100"
                placeholder="0"
                className="w-32 h-8 text-sm text-right"
                value={manualBudget}
                onChange={(e) => setManualBudget(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            {availableCategories.map((cat) => {
              const isSelected = selectedCategories.has(cat.id);
              return (
                <div
                  key={cat.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 h-12 transition-colors ${isSelected ? 'bg-secondary/30' : ''}`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleCategory(cat.id)}
                    id={`cat-${cat.id}`}
                  />
                  <label htmlFor={`cat-${cat.id}`} className="flex-1 text-sm cursor-pointer">
                    {cat.name}
                  </label>
                  {budgetMode === 'category' && (
                    <div className={`flex items-center gap-2 ${isSelected ? 'visible' : 'invisible'}`}>
                      <span className="text-xs text-muted-foreground">{baseCurrency}</span>
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        placeholder="0"
                        tabIndex={isSelected ? 0 : -1}
                        className="w-28 h-8 text-sm text-right"
                        value={isSelected ? (selectedCategories.get(cat.id) || '') : ''}
                        onChange={(e) => setCategoryBudget(cat.id, parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Custom category..."
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && addCustomCategory()}
            />
            <Button size="sm" variant="outline" onClick={addCustomCategory} disabled={!newCategoryName.trim()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>

          <div className="flex justify-between border-t pt-3 text-sm font-medium">
            <span>Total Budget</span>
            <span>{formatCurrency(budgetMode === 'total' ? (parseFloat(manualBudget) || 0) : totalBudget, baseCurrency)}</span>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleCreateProject} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Project
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
