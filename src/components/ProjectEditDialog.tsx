import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Textarea } from '@/components/ui/textarea';
import { Project, Category } from '@/types/database';
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
import { Plus, FileText, X, Upload, Loader2, Trash2, Pencil } from 'lucide-react';
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
  const { baseCurrency } = useUserSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [extractingContext, setExtractingContext] = useState(false);
  const [editingAiContext, setEditingAiContext] = useState(false);
  const [budgetMode, setBudgetMode] = useState<'total' | 'category'>('total');
  const [manualBudget, setManualBudget] = useState('');

  // Details
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [aiContext, setAiContext] = useState('');
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

  // Load current data when sheet opens
  useEffect(() => {
    if (!open) return;

    setName(project.name);
    setDescription(project.description ?? '');
    setAiContext(project.ai_context ?? '');
    setEditingAiContext(false);
    setStatus(project.status as 'Active' | 'Completed' | 'Archived');
    setDocsToDelete(new Set());
    setPendingFiles([]);
    setNewCategoryName('');

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
    const parts: string[] = [];
    let failed = 0;
    for (const file of files) {
      try {
        const form = new FormData();
        form.append('file', file);
        const resp = await fetch(`${BACKEND}/api/projects/extract-context`, {
          method: 'POST',
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          body: form,
        });
        console.log('[extract-context] status:', resp.status);
        if (resp.ok) {
          const json = await resp.json();
          console.log('[extract-context] response:', json);
          const extracted = json.description;
          if (extracted) parts.push(`From ${file.name}:\n${extracted}`);
        } else {
          const err = await resp.json().catch(() => ({}));
          console.error('[extract-context] failed:', resp.status, err);
          failed++;
        }
      } catch (e) {
        console.error('Extract context network error:', e);
        failed++;
      }
    }
    if (parts.length > 0) {
      setAiContext((prev) => {
        const separator = prev.trim() ? '\n\n' : '';
        return prev.trim() + separator + parts.join('\n\n');
      });
      toast({ title: 'Context extracted', description: 'Document context has been added below.' });
    } else if (failed > 0) {
      toast({ title: 'Extraction failed', description: 'Could not reach the backend. Check it is running and deployed.', variant: 'destructive' });
    }
    setExtractingContext(false);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files!);
    setPendingFiles((prev) => [...prev, ...files]);
    e.target.value = '';
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
    if (!user || !name.trim()) return;
    setSubmitting(true);

    try {
      const budgetToSave = budgetMode === 'total' ? (parseFloat(manualBudget) || 0) : totalBudget;
      const { error: projError } = await supabase
        .from('projects')
        .update({ name: name.trim(), description: description.trim() || null, ai_context: aiContext.trim() || null, status, budget: budgetToSave })
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
                  <div className="flex items-center justify-between">
                    <Label>Extracted from project documents</Label>
                    <div className="flex items-center gap-2">
                      {extractingContext && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Extracting…
                        </span>
                      )}
                      {!editingAiContext && !extractingContext && (
                        <button
                          type="button"
                          onClick={() => setEditingAiContext(true)}
                          className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {editingAiContext && (
                        <button
                          type="button"
                          onClick={() => setEditingAiContext(false)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Done
                        </button>
                      )}
                    </div>
                  </div>
                  {editingAiContext ? (
                    <Textarea
                      autoFocus
                      value={aiContext}
                      onChange={(e) => setAiContext(e.target.value)}
                      className="min-h-[100px] resize-none text-sm"
                    />
                  ) : (
                    <div
                      className="rounded-md border bg-secondary/20 px-3 py-2.5 text-sm text-muted-foreground whitespace-pre-line min-h-[80px] cursor-pointer"
                      onClick={() => setEditingAiContext(true)}
                    >
                      {aiContext || (
                        <span className="italic opacity-50">
                          Upload a document below and we'll extract key project context here automatically.
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Both fields are seen by the AI when assigning invoices and answering questions.</p>
                </div>
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

            <Card>
              <CardContent className="p-0">
                {/* Existing docs */}
                {visibleDocs.length > 0 && (
                  <div className="divide-y">
                    {visibleDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 px-5 py-3"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-sm truncate">
                          {doc.file_name}
                        </span>
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
                      <div
                        key={i}
                        className="flex items-center gap-3 px-5 py-3 bg-secondary/20"
                      >
                        <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-sm truncate">
                          {file.name}
                        </span>
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
                  <div className="px-5 py-8 text-center">
                    <FileText className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No documents yet
                    </p>
                  </div>
                )}

                {/* Upload button row */}
                <div className="border-t px-5 py-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-muted-foreground"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-3.5 w-3.5" /> Upload files
                  </Button>
                </div>
              </CardContent>
            </Card>

            {docsToDelete.size > 0 && (
              <p className="mt-2 text-xs text-destructive">
                {docsToDelete.size} document
                {docsToDelete.size > 1 ? 's' : ''} will be removed on save.{' '}
                <button
                  className="underline hover:no-underline"
                  onClick={() => setDocsToDelete(new Set())}
                >
                  Undo
                </button>
              </p>
            )}
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
