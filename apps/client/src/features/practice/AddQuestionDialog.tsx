import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { z } from 'zod';
import { DIFFICULTIES, QUESTION_TYPES, createQuestionSchema, type CategoryView } from '@aia/shared';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/overlays';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorCode, errorMessage, fieldErrors } from '@/store/api';
import { useCreateQuestionMutation } from '@/store/questionsApi';
import { DIFFICULTY_LABELS, capitalize } from '@/lib/format';

// The form edits tags as a comma-separated string; everything else matches the API schema.
const formSchema = createQuestionSchema.extend({ tags: z.string().max(200) });
type FormValues = z.input<typeof formSchema>;

const TYPE_LABELS: Record<(typeof QUESTION_TYPES)[number], string> = {
  conceptual: 'Conceptual',
  coding: 'Coding',
  behavioral: 'Behavioural',
  system_design: 'System design',
  scenario: 'Scenario',
};

/** Add a private question to the user's own bank (only they can see it). */
export function AddQuestionDialog({ categories }: { categories: CategoryView[] }) {
  const [open, setOpen] = useState(false);
  const [createQuestion] = useCreateQuestionMutation();
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { categorySlug: '', question: '', difficulty: 'medium', type: 'conceptual', tags: '' },
  });

  const onSubmit = async (values: FormValues) => {
    const tags = values.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await createQuestion({ ...values, tags }).unwrap();
      toast.success('Question added to your bank');
      reset();
      setOpen(false);
    } catch (err) {
      if (errorCode(err) === 'CONFLICT') return setError('question', { message: 'You have already added this question' });
      const fields = fieldErrors(err);
      for (const [path, message] of Object.entries(fields)) {
        if (path === 'question' || path === 'categorySlug') setError(path, { message });
      }
      if (!Object.keys(fields).length) toast.error(errorMessage(err, 'Could not add the question.'));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> Add your own question
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a question</DialogTitle>
          <DialogDescription>Only you can see questions you add. They appear in your practice sessions.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Field label="Question" htmlFor="new-question" error={errors.question?.message}>
            <Textarea id="new-question" rows={3} aria-invalid={!!errors.question} {...register('question')} />
          </Field>
          <Field label="Category" htmlFor="new-category" error={errors.categorySlug?.message}>
            <Controller
              control={control}
              name="categorySlug"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="new-category" aria-invalid={!!errors.categorySlug}>
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
              )}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Difficulty" htmlFor="new-difficulty">
              <Controller
                control={control}
                name="difficulty"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="new-difficulty">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTIES.map((d) => (
                        <SelectItem key={d} value={d}>
                          {DIFFICULTY_LABELS[d]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Type" htmlFor="new-type">
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="new-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUESTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TYPE_LABELS[t] ?? capitalize(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
          <Field label="Tags (optional)" htmlFor="new-tags" hint="Comma-separated, e.g. hooks, performance" error={errors.tags?.message}>
            <Input id="new-tags" {...register('tags')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />} Add question
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
