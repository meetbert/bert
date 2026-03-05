import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Textarea } from '@/components/ui/textarea';
import { Category } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { Plus, FileText, X, Upload, Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
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
  const { baseCurrency } = useUserSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 — Project Details
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

  // Step 3 — Documents
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  useEffect(() => {
    supabase
      .from('invoice_categories')
      .select('*')
      .order('name')
      .then(({ data }) => setAvailableCategories(data ?? []));
  }, []);

  const totalBudget = Array.from(selectedCategories.values()).reduce(
    (sum, b) => sum + b,
    0,
  );

  // ── Category helpers ──────────────────────────────────────────────

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.set(id, 0);
      }
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

    // Try to insert; if name collision, look up existing
    const { data, error } = await supabase
      .from('invoice_categories')
      .insert({ name: trimmed })
      .select('id, name')
      .single();

    if (error) {
      // Likely unique constraint violation — find existing
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

  // ── File helpers ──────────────────────────────────────────────────

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setPendingFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Create project ────────────────────────────────────────────────

  const handleCreateProject = async () => {
    if (!user) return;
    setSubmitting(true);

    try {
      // 1. Insert project
      const parseList = (text: string) => text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
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

      // 2. Bulk insert project_categories
      if (selectedCategories.size > 0) {
        const rows = Array.from(selectedCategories.entries()).map(
          ([categoryId, budget]) => ({
            project_id: projectId,
            category_id: categoryId,
            budget,
          }),
        );
        const { error: catError } = await supabase
          .from('project_categories')
          .insert(rows);
        if (catError) throw catError;
      }

      // 3. Upload documents + insert project_documents
      for (const file of pendingFiles) {
        const storagePath = `${user.id}/${projectId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('project-documents-bucket')
          .upload(storagePath, file);
        if (uploadError) throw uploadError;

        const { error: docError } = await supabase
          .from('project_documents')
          .insert({
            project_id: projectId,
            file_name: file.name,
            storage_path: storagePath,
          });
        if (docError) throw docError;
      }

      toast({ title: 'Project created', description: `"${name}" is ready.` });
      onComplete(projectId);
    } catch (err: any) {
      toast({
        title: 'Error creating project',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {showProgress && (
        <Progress value={(step / 3) * 100} className="mb-2" />
      )}

      {/* ── Step 1: Project Details ──────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Project Details</h3>
            <p className="text-sm text-muted-foreground">
              Name your project to get started.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Project Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My First Production"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project? Add context here, or upload documents in Step 3."
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
            <p className="text-xs text-muted-foreground">Separate with commas or new lines. Used by AI when assigning invoices.</p>
          </div>

          <div className="space-y-2">
            <Label>Known Locations <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={knownLocations}
              onChange={(e) => setKnownLocations(e.target.value)}
              placeholder="e.g. Pinewood Studios, Location X, London"
              className="min-h-[60px] resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">Separate with commas or new lines. Used by AI when assigning invoices.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button onClick={() => setStep(2)} disabled={!name.trim()}>
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

          {/* Total budget input (total mode only) */}
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
                  className={`flex items-center gap-3 rounded-lg border px-3 h-12 transition-colors ${
                    isSelected ? 'bg-secondary/30' : ''
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleCategory(cat.id)}
                    id={`cat-${cat.id}`}
                  />
                  <label
                    htmlFor={`cat-${cat.id}`}
                    className="flex-1 text-sm cursor-pointer"
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
                        className="w-28 h-8 text-sm text-right"
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
          <div className="flex items-center gap-2">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Custom category..."
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && addCustomCategory()}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={addCustomCategory}
              disabled={!newCategoryName.trim()}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>

          {/* Running total */}
          <div className="flex justify-between border-t pt-3 text-sm font-medium">
            <span>Total Budget</span>
            <span>{formatCurrency(
              budgetMode === 'total' ? (parseFloat(manualBudget) || 0) : totalBudget,
              baseCurrency,
            )}</span>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <Button onClick={() => setStep(3)}>
              Next <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Upload Documents ─────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Upload Documents</h3>
            <p className="text-sm text-muted-foreground">
              Optionally upload briefs, budgets, scripts, or other project
              documents. These help the AI agent understand your project.
            </p>
          </div>

          <div
            className="rounded-lg border-2 border-dashed p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              Click to choose files or drag them here
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Choose Files
            </Button>
          </div>

          {pendingFiles.length > 0 && (
            <div className="space-y-2">
              {pendingFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 text-sm truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    onClick={() => removeFile(i)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleCreateProject} disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Project
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
