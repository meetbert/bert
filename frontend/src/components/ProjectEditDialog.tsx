import { useState, useEffect, useRef, ChangeEvent } from 'react';
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
import { Project, Category } from '@/types/database';
import { useDemoData } from '@/contexts/DemoDataContext';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Plus, FileText, X, Upload, Loader2, Trash2 } from 'lucide-react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { formatCurrency } from '@/lib/currency';

interface ProjectEditDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface ExistingDoc {
  id: string;
  file_name: string;
  storage_path: string;
}

export const ProjectEditDialog = ({
  project,
  open,
  onOpenChange,
  onSaved,
}: ProjectEditDialogProps) => {
  const { user, session } = useAuth();
  const { isDemoMode, demoCategories, demoProjectCategories, demoProjectDocs, updateDemoProject, addDemoCategory } = useDemoData();
  const { baseCurrency } = useUserSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [extractingContext, setExtractingContext] = useState(false);
  const [converting, setConverting] = useState(false);
  const [budgetMode, setBudgetMode] = useState<'total' | 'category'>('total');
  const [manualBudget, setManualBudget] = useState('');

  // Details
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [knownVendors, setKnownVendors] = useState('');
  const [knownLocations, setKnownLocations] = useState('');
  const [status, setStatus] = useState<'Active' | 'Completed' | 'Archived'>(project.status as 'Active' | 'Completed' | 'Archived');

  // Categories & Budgets
  const [availableCategories, setAvailableCategories] = useState<Category[]>(
    [],
  );
  const [selectedCategories, setSelectedCategories] = useState<
    Map<string, number>
  >(new Map());
  const [newCategoryName, setNewCategoryName] = useState('');

  // Documents
  const [existingDocs, setExistingDocs] = useState<ExistingDoc[]>([]);
  const [docsToDelete, setDocsToDelete] = useState<Set<string>>(new Set());
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Load current data when sheet opens
  useEffect(() => {
    if (!open) return;

    setName(project.name);
    setDescription(project.description ?? '');
    setKnownVendors((project.known_vendors ?? []).join(', '));
    setKnownLocations((project.known_locations ?? []).join(', '));
    setStatus(project.status as 'Active' | 'Completed' | 'Archived');
    setDocsToDelete(new Set());
    setPendingFiles([]);
    setNewCategoryName('');

    if (isDemoMode && project.id.startsWith('demo-')) {
      setAvailableCategories([...demoCategories].sort((a, b) => a.name.localeCompare(b.name)));
      const projDocs = demoProjectDocs.filter(d => d.project_id === project.id);
      setExistingDocs(projDocs.map(d => ({ id: d.id, file_name: d.file_name, storage_path: d.signedUrl })));
      const projCats = demoProjectCategories.filter(pc => pc.project_id === project.id);
      const selected = new Map<string, number>();
      projCats.forEach(pc => selected.set(pc.category_id, pc.budget ?? 0));
      setSelectedCategories(selected);
      const hasCategoryBudgets = projCats.some(pc => (pc.budget ?? 0) > 0);
      setBudgetMode(hasCategoryBudgets ? 'category' : 'total');
      setManualBudget(hasCategoryBudgets ? '' : (project.budget > 0 ? String(project.budget) : ''));
      return;
    }

    Promise.all([
      supabase.from('invoice_categories').select('*').order('name'),
      supabase
        .from('project_categories')
        .select('*, invoice_categories(name)')
        .eq('project_id', project.id),
      supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', project.id),
    ]).then(([allCats, projCats, docs]) => {
      setAvailableCategories(allCats.data ?? []);
      setExistingDocs(docs.data ?? []);

      const selected = new Map<string, number>();
      (projCats.data ?? []).forEach((pc: any) => {
        selected.set(pc.category_id, pc.budget ?? 0);
      });
      setSelectedCategories(selected);

      const hasCategoryBudgets = (projCats.data ?? []).some((pc: any) => (pc.budget ?? 0) > 0);
      setBudgetMode(hasCategoryBudgets ? 'category' : 'total');
      setManualBudget(hasCategoryBudgets ? '' : (project.budget > 0 ? String(project.budget) : ''));
    });
  }, [open, project.id]);

  const totalBudget = Array.from(selectedCategories.values()).reduce(
    (sum, b) => sum + b,
    0,
  );

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
        if (!availableCategories.find((c) => c.id === existing.id)) {
          setAvailableCategories((prev) => [...prev, existing]);
        }
        setSelectedCategories((prev) => {
          const next = new Map(prev);
          if (!next.has(existing.id)) next.set(existing.id, 0);
          return next;
        });
        setNewCategoryName('');
        return;
      }
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
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

  // ── File helpers ──────────────────────────────────────────────────

  const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';

  const extractContextFromFiles = async (files: File[]) => {
    setExtractingContext(true);
    let anySuccess = false;
    for (const file of files) {
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
          if (json.description) setDescription((prev) => prev.trim() ? prev : json.description);
          if (json.known_vendors?.length) setKnownVendors(json.known_vendors.join(', '));
          if (json.known_locations?.length) setKnownLocations(json.known_locations.join(', '));
          anySuccess = true;
        }
      } catch {
        // ignore per-file errors
      }
    }
    if (anySuccess) {
      toast({ title: 'Brief extracted', description: 'Project details updated below — review and edit as needed.' });
    } else {
      toast({ title: 'Extraction failed', description: 'Could not reach the backend.', variant: 'destructive' });
    }
    setExtractingContext(false);
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const raw = Array.from(e.target.files!);
    e.target.value = '';
    setConverting(true);
    const files = await prepareFiles(raw);
    setConverting(false);
    if (!files.length) return;
    setPendingFiles((prev) => [...prev, ...files]);
    extractContextFromFiles(files);
  };

  const handleDrop = async (e: { preventDefault: () => void; dataTransfer: DataTransfer }) => {
    e.preventDefault();
    setIsDragging(false);
    if (extractingContext || converting) return;
    const raw = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(pdf|jpe?g|png|webp)$/i.test(f.name),
    );
    if (!raw.length) return;
    setConverting(true);
    const files = await prepareFiles(raw);
    setConverting(false);
    if (!files.length) return;
    setPendingFiles((prev) => [...prev, ...files]);
    extractContextFromFiles(files);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleDeleteDoc = (id: string) => {
    setDocsToDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Save ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) return;
    setSubmitting(true);

    const parseList = (text: string) => text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

    if (isDemoMode && project.id.startsWith('demo-')) {
      const budgetToSave = budgetMode === 'total' ? (parseFloat(manualBudget) || 0) : totalBudget;
      updateDemoProject(project.id, {
        name: name.trim(),
        description: description.trim() || null,
        status,
        budget: budgetToSave,
        known_vendors: parseList(knownVendors),
        known_locations: parseList(knownLocations),
      });
      toast({ title: 'Project updated' });
      onOpenChange(false);
      onSaved();
      setSubmitting(false);
      return;
    }

    if (!user) { setSubmitting(false); return; }

    try {
      const budgetToSave = budgetMode === 'total' ? (parseFloat(manualBudget) || 0) : totalBudget;
      const { error: projError } = await supabase
        .from('projects')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          known_vendors: parseList(knownVendors),
          known_locations: parseList(knownLocations),
          status,
          budget: budgetToSave,
        })
        .eq('id', project.id);
      if (projError) throw projError;

      const { error: delCatError } = await supabase
        .from('project_categories')
        .delete()
        .eq('project_id', project.id);
      if (delCatError) throw delCatError;

      if (selectedCategories.size > 0) {
        const rows = Array.from(selectedCategories.entries()).map(
          ([categoryId, budget]) => ({
            project_id: project.id,
            category_id: categoryId,
            budget,
          }),
        );
        const { error: insCatError } = await supabase
          .from('project_categories')
          .insert(rows);
        if (insCatError) throw insCatError;
      }

      for (const docId of docsToDelete) {
        const doc = existingDocs.find((d) => d.id === docId);
        if (doc) {
          await supabase.storage
            .from('project-documents-bucket')
            .remove([doc.storage_path]);
          await supabase.from('project_documents').delete().eq('id', docId);
        }
      }

      for (const file of pendingFiles) {
        const storagePath = `${user.id}/${project.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('project-documents-bucket')
          .upload(storagePath, file);
        if (uploadError) throw uploadError;

        const { error: docError } = await supabase
          .from('project_documents')
          .insert({
            project_id: project.id,
            file_name: file.name,
            storage_path: storagePath,
          });
        if (docError) throw docError;
      }

      toast({ title: 'Project updated' });
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast({
        title: 'Error saving project',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const visibleDocs = existingDocs.filter((d) => !docsToDelete.has(d.id));
  const selectedCount = selectedCategories.size;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-xl w-full flex flex-col overflow-hidden"
      >
        <SheetHeader className="mb-6 shrink-0">
          <SheetTitle className="text-xl">Edit Project</SheetTitle>
          <SheetDescription>
            Update project details, manage budget categories, and upload
            documents.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-8 overflow-y-auto flex-1 pb-4">
          {/* ── Documents ────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Documents
              </h3>
              <span className="text-xs text-muted-foreground">
                {visibleDocs.length + pendingFiles.length} file
                {visibleDocs.length + pendingFiles.length !== 1 ? 's' : ''}
              </span>
            </div>

            <Card
              className={isDragging ? 'border-primary ring-1 ring-primary' : ''}
              onDragOver={(e) => { e.preventDefault(); if (!extractingContext && !converting) setIsDragging(true); }}
              onDragEnter={(e) => { e.preventDefault(); if (!extractingContext && !converting) setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <CardContent className="p-0">
                {/* Upload button row — at the top */}
                <div className="px-5 py-3 border-b">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-muted-foreground"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={extractingContext || converting}
                    >
                      <Upload className="mr-2 h-3.5 w-3.5" /> Upload files
                    </Button>
                    {(converting || extractingContext) && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> {converting ? 'Converting to PDF…' : 'Extracting project details…'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Existing docs */}
                {visibleDocs.length > 0 && (
                  <div className="divide-y">
                    {visibleDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-sm truncate">{doc.file_name}</span>
                        <button
                          onClick={() => toggleDeleteDoc(doc.id)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Remove document"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending uploads */}
                {pendingFiles.length > 0 && (
                  <div className={`divide-y ${visibleDocs.length > 0 ? 'border-t' : ''}`}>
                    {pendingFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3 bg-secondary/20">
                        <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-sm truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {(file.size / 1024).toFixed(0)} KB
                        </span>
                        <button
                          onClick={() => removePendingFile(i)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {visibleDocs.length === 0 && pendingFiles.length === 0 && (
                  <div className="px-5 py-6 text-center">
                    <FileText className="mx-auto h-7 w-7 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No documents yet</p>
                  </div>
                )}

              </CardContent>
            </Card>

            {docsToDelete.size > 0 && (
              <p className="mt-2 text-xs text-destructive">
                {docsToDelete.size} document{docsToDelete.size > 1 ? 's' : ''} will be removed on save.{' '}
                <button className="underline hover:no-underline" onClick={() => setDocsToDelete(new Set())}>
                  Undo
                </button>
              </p>
            )}
          </section>

          {/* ── General ──────────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
              General
            </h3>
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Project Name</Label>
                  <Input
                    id="edit-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Project name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as 'Active' | 'Completed' | 'Archived')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Project Description</Label>
                  <Textarea
                    id="edit-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add any context about this project — what it's for, key contacts, anything useful."
                    className="min-h-[80px] resize-none text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Known Vendors <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    value={knownVendors}
                    onChange={(e) => setKnownVendors(e.target.value)}
                    placeholder="e.g. ACME Productions, Studio X, Catering Co"
                    className="min-h-[60px] resize-none text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Known Locations <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    value={knownLocations}
                    onChange={(e) => setKnownLocations(e.target.value)}
                    placeholder="e.g. Pinewood Studios, Location X, London"
                    className="min-h-[60px] resize-none text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground border-t pt-3">The description, vendors, and locations above are all seen by the AI when assigning invoices and answering questions about this project.</p>
              </CardContent>
            </Card>
          </section>

          {/* ── Categories & Budgets ─────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Categories & Budgets
              </h3>
              <span className="text-xs text-muted-foreground">
                {selectedCount} selected
              </span>
            </div>

            {/* Budget mode toggle */}
            <div className="flex rounded-md border overflow-hidden text-sm mb-3">
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

            <Card>
              <CardContent className="p-0">
                {/* Total budget input (total mode only) */}
                {budgetMode === 'total' && (
                  <div className="flex items-center gap-3 px-5 py-3 border-b">
                    <span className="text-sm text-muted-foreground flex-1">Total budget</span>
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

                {/* Category list */}
                <div className="divide-y">
                  {availableCategories.map((cat) => {
                    const isSelected = selectedCategories.has(cat.id);
                    return (
                      <div
                        key={cat.id}
                        className={`flex items-center gap-4 px-5 h-12 transition-colors ${
                          isSelected ? 'bg-secondary/30' : ''
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleCategory(cat.id)}
                          id={`edit-cat-${cat.id}`}
                        />
                        <label
                          htmlFor={`edit-cat-${cat.id}`}
                          className="flex-1 text-sm cursor-pointer select-none"
                        >
                          {cat.name}
                        </label>
                        {budgetMode === 'category' && (
                          <div className={`flex items-center gap-2 ${isSelected ? 'visible' : 'invisible'}`}>
                            <span className="text-xs text-muted-foreground">
                              {baseCurrency}
                            </span>
                            <Input
                              type="number"
                              min="0"
                              step="100"
                              placeholder="0"
                              tabIndex={isSelected ? 0 : -1}
                              className="w-32 h-8 text-sm text-right"
                              value={isSelected ? (selectedCategories.get(cat.id) || '') : ''}
                              onChange={(e) =>
                                setCategoryBudget(
                                  cat.id,
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add custom category */}
                <div className="flex items-center gap-3 border-t px-5 py-3">
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Add custom category..."
                    className="flex-1 border-0 shadow-none px-0 focus-visible:ring-0 h-8"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomCategory()}
                  />
                  {newCategoryName.trim() && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3"
                      onClick={addCustomCategory}
                    >
                      Add
                    </Button>
                  )}
                </div>

                {/* Total */}
                <div className="flex items-center justify-between border-t bg-secondary/20 px-5 py-3">
                  <span className="text-sm font-medium">Total Budget</span>
                  <span className="text-sm font-semibold">
                    {formatCurrency(
                      budgetMode === 'total' ? (parseFloat(manualBudget) || 0) : totalBudget,
                      baseCurrency,
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
          </section>

        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t pt-4 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting || !name.trim()}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
