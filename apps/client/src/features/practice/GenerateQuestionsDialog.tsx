import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { DIFFICULTIES, type CategoryView, type Difficulty } from '@aia/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/overlays';
import { Segmented } from '@/components/ui/overlays';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorCode, errorMessage } from '@/store/api';
import { aiErrorCopy, useGenerateQuestionsMutation } from '@/store/aiApi';
import { DIFFICULTY_LABELS } from '@/lib/format';

const COUNTS = ['3', '5', '10'] as const;

/** Ask the AI for new practice questions; they're saved privately to the user's bank. */
export function GenerateQuestionsDialog({ categories }: { categories: CategoryView[] }) {
  const [open, setOpen] = useState(false);
  const [categorySlug, setCategorySlug] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [count, setCount] = useState<(typeof COUNTS)[number]>('5');
  const [error, setError] = useState<string>();
  const [generate, { isLoading }] = useGenerateQuestionsMutation();

  const submit = async () => {
    if (!categorySlug) return setError('Choose a category');
    try {
      const created = await generate({ categorySlug, difficulty, count: Number(count) }).unwrap();
      toast.success(
        created.length
          ? `Added ${created.length} new question${created.length === 1 ? '' : 's'} to your bank`
          : 'No new questions this time — try another difficulty.',
      );
      setOpen(false);
    } catch (err) {
      toast.error(aiErrorCopy(errorCode(err), errorMessage(err, 'Could not generate questions.')).description);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Sparkles /> Generate with AI
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate practice questions</DialogTitle>
          <DialogDescription>The AI writes new questions you don't have yet. They're private to you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Category" htmlFor="gen-category" error={error}>
            <Select
              value={categorySlug}
              onValueChange={(v) => {
                setError(undefined);
                setCategorySlug(v);
              }}
            >
              <SelectTrigger id="gen-category" aria-invalid={!!error}>
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {categories.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">Difficulty</span>
            <Segmented
              label="Difficulty"
              value={difficulty}
              onValueChange={setDifficulty}
              options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">How many</span>
            <Segmented label="How many questions" value={count} onValueChange={setCount} options={COUNTS.map((n) => ({ value: n, label: n }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {isLoading ? 'Generating…' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
