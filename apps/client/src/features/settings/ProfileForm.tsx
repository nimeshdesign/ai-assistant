import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Save, X } from 'lucide-react';
import { EXPERIENCE_LEVELS, JOB_ROLES, profileUpdateSchema, type ProfileUpdateInput, type ProfileView } from '@aia/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form-controls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorState } from '@/components/common/states';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, fieldErrors } from '@/store/api';
import { useGetProfileQuery, useUpdateProfileMutation } from '@/store/authApi';
import { capitalize } from '@/lib/format';

const LANGUAGE_SUGGESTIONS = ['JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'Go', 'SQL', 'PHP', 'Kotlin', 'Rust'];

export function ProfileForm() {
  const { data, isLoading, isError, refetch } = useGetProfileQuery();
  if (isLoading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (isError || !data) return <ErrorState description="We couldn't load your profile." onRetry={refetch} />;
  return <ProfileFormInner profile={data} />;
}

function ProfileFormInner({ profile }: { profile: ProfileView }) {
  const [updateProfile] = useUpdateProfileMutation();
  const [langInput, setLangInput] = useState('');

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ProfileUpdateInput>({ resolver: zodResolver(profileUpdateSchema), defaultValues: profile });

  const languages = watch('preferredLanguages');
  const addLanguage = (lang: string) => {
    const l = lang.trim();
    if (!l || languages.some((x) => x.toLowerCase() === l.toLowerCase())) return;
    setValue('preferredLanguages', [...languages, l], { shouldDirty: true, shouldValidate: true });
    setLangInput('');
  };

  const onSubmit = async (values: ProfileUpdateInput) => {
    try {
      const saved = await updateProfile(values).unwrap();
      reset(saved);
      toast.success('Profile saved');
    } catch (err) {
      const fields = fieldErrors(err);
      for (const [path, message] of Object.entries(fields)) setError(path as keyof ProfileUpdateInput, { message });
      if (!Object.keys(fields).length) toast.error(errorMessage(err, 'Could not save your profile.'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="Headline" htmlFor="headline" hint="e.g. Frontend developer who loves performance" error={errors.headline?.message}>
          <Input id="headline" aria-invalid={!!errors.headline} {...register('headline')} />
        </Field>
        <Field label="Target role" htmlFor="targetRole" error={errors.targetRole?.message}>
          <Input id="targetRole" list="role-suggestions" aria-invalid={!!errors.targetRole} {...register('targetRole')} />
          <datalist id="role-suggestions">
            {JOB_ROLES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Experience level" htmlFor="experienceLevel">
            <Controller
              control={control}
              name="experienceLevel"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="experienceLevel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {capitalize(l)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Years" htmlFor="yearsOfExperience" error={errors.yearsOfExperience?.message}>
            <Input
              id="yearsOfExperience"
              type="number"
              min={0}
              max={50}
              aria-invalid={!!errors.yearsOfExperience}
              {...register('yearsOfExperience')}
            />
          </Field>
        </div>
      </div>

      <Field
        label="Preferred programming languages"
        htmlFor="language-input"
        hint="Used for code examples in answers. Press Enter to add."
        error={errors.preferredLanguages?.message}
      >
        <div className="flex flex-wrap gap-1.5">
          {languages.map((l) => (
            <Badge key={l} variant="secondary" className="gap-1 pr-1">
              {l}
              <button
                type="button"
                aria-label={`Remove ${l}`}
                className="rounded-sm p-0.5 hover:bg-background/60"
                onClick={() =>
                  setValue(
                    'preferredLanguages',
                    languages.filter((x) => x !== l),
                    { shouldDirty: true, shouldValidate: true },
                  )
                }
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <Input
          id="language-input"
          list="language-suggestions"
          placeholder="Add a language"
          value={langInput}
          onChange={(e) => setLangInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addLanguage(langInput);
            }
          }}
        />
        <datalist id="language-suggestions">
          {LANGUAGE_SUGGESTIONS.filter((l) => !languages.includes(l)).map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </Field>

      <div className="flex justify-end gap-2 border-t pt-5">
        <Button type="button" variant="ghost" disabled={!isDirty || isSubmitting} onClick={() => reset(profile)}>
          Discard changes
        </Button>
        <Button type="submit" disabled={!isDirty || isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} Save profile
        </Button>
      </div>
    </form>
  );
}
