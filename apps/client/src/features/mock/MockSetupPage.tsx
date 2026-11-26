import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Loader2, Play, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  CATEGORY_CATALOG,
  EXPERIENCE_LEVELS,
  JOB_ROLES,
  MOCK_QUESTION_COUNTS,
  type ExperienceLevel,
  type MockInterviewSetup,
} from '@aia/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form-controls';
import { Segmented } from '@/components/ui/overlays';
import { useAppSelector } from '@/store';
import { errorMessage } from '@/store/api';
import { useDeleteMockInterviewMutation, useListMockInterviewsQuery, useStartMockInterviewMutation } from '@/store/mockApi';
import { capitalize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PastInterviews } from './PastInterviews';

const LEVEL_HINTS: Record<ExperienceLevel, string> = {
  fresher: 'Student or first job',
  junior: '0–2 years',
  mid: '2–5 years',
  senior: '5+ years',
  lead: 'Leads a team',
};
const STEPS = ['Role', 'Experience', 'Focus'] as const;
const COUNTS = MOCK_QUESTION_COUNTS.map(String) as ['3', '5', '8', '10'];

export default function MockSetupPage() {
  const navigate = useNavigate();
  const profile = useAppSelector((s) => s.settings.profile);
  const inProgress = useListMockInterviewsQuery({ status: 'in_progress', limit: 1 }).data?.[0];
  const [startMock, { isLoading }] = useStartMockInterviewMutation();
  const [discard, { isLoading: discarding }] = useDeleteMockInterviewMutation();

  const [step, setStep] = useState(0);
  const [setup, setSetup] = useState<MockInterviewSetup>({
    jobRole: profile.targetRole || JOB_ROLES[0],
    experienceLevel: profile.experienceLevel,
    focusAreas: [],
    questionCount: 5,
  });
  const [roleError, setRoleError] = useState<string>();

  const next = () => {
    if (step === 0 && setup.jobRole.trim().length < 2) {
      setRoleError('Enter the role you are interviewing for');
      return;
    }
    setStep((s) => s + 1);
  };

  const start = async () => {
    try {
      const interview = await startMock({ ...setup, jobRole: setup.jobRole.trim() }).unwrap();
      navigate(`/mock-interview/${interview.id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start the interview. Please try again.'));
    }
  };

  return (
    <>
      <PageHeader
        title="Mock Interview"
        description="A realistic interview: one question at a time, with AI feedback after every answer."
      />

      {inProgress && (
        <Card className="mb-4 border-primary/40 bg-accent/40">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              You have an unfinished interview: <span className="font-medium">{inProgress.jobRole}</span>, {inProgress.answeredCount} of{' '}
              {inProgress.totalQuestions} answered. Starting a new one ends it.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={discarding}
                onClick={() =>
                  discard(inProgress.id)
                    .unwrap()
                    .then(() => toast.success('Interview discarded.'))
                    .catch((err) => toast.error(errorMessage(err)))
                }
              >
                <RotateCcw /> Discard
              </Button>
              <Button size="sm" asChild>
                <Link to={`/mock-interview/${inProgress.id}`}>Resume</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <ol className="mb-2 flex items-center gap-2 text-xs" aria-label="Setup steps">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-2" aria-current={i === step ? 'step' : undefined}>
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full border font-mono',
                    i < step && 'border-primary bg-primary text-primary-foreground',
                    i === step && 'border-primary text-primary',
                    i > step && 'text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <span className={cn(i === step ? 'font-medium' : 'text-muted-foreground')}>{label}</span>
                {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
              </li>
            ))}
          </ol>
          <CardTitle>
            {step === 0 && 'Which role are you interviewing for?'}
            {step === 1 && 'What is your experience level?'}
            {step === 2 && 'What should the interview focus on?'}
          </CardTitle>
          <CardDescription>
            {step === 0 && 'Questions are tailored to the role.'}
            {step === 1 && 'Sets the depth and difficulty of the questions.'}
            {step === 2 && 'Pick topics, or leave empty for a broad mix.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {JOB_ROLES.map((r) => (
                  <Button
                    key={r}
                    type="button"
                    size="sm"
                    variant={setup.jobRole === r ? 'default' : 'outline'}
                    aria-pressed={setup.jobRole === r}
                    onClick={() => {
                      setRoleError(undefined);
                      setSetup((s) => ({ ...s, jobRole: r }));
                    }}
                  >
                    {r}
                  </Button>
                ))}
              </div>
              <Field label="Or type a role" htmlFor="jobRole" error={roleError}>
                <Input
                  id="jobRole"
                  value={setup.jobRole}
                  maxLength={80}
                  aria-invalid={!!roleError}
                  onChange={(e) => {
                    setRoleError(undefined);
                    setSetup((s) => ({ ...s, jobRole: e.target.value }));
                  }}
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Experience level">
              {EXPERIENCE_LEVELS.map((lvl) => {
                const on = setup.experienceLevel === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSetup((s) => ({ ...s, experienceLevel: lvl }))}
                    className={cn(
                      'rounded-lg border p-3 text-left outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      on && 'border-primary bg-accent/60',
                    )}
                  >
                    <span className="block text-sm font-medium">{capitalize(lvl)}</span>
                    <span className="block text-xs text-muted-foreground">{LEVEL_HINTS[lvl]}</span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Focus areas">
                {CATEGORY_CATALOG.map((c) => {
                  const on = setup.focusAreas.includes(c.slug);
                  return (
                    <Button
                      key={c.slug}
                      type="button"
                      size="sm"
                      variant={on ? 'default' : 'outline'}
                      aria-pressed={on}
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() =>
                        setSetup((s) => ({
                          ...s,
                          focusAreas: on ? s.focusAreas.filter((f) => f !== c.slug) : [...s.focusAreas, c.slug],
                        }))
                      }
                    >
                      {c.name}
                    </Button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium" id="count-label">
                  Number of questions
                </span>
                <Segmented
                  label="Number of questions"
                  value={String(setup.questionCount) as (typeof COUNTS)[number]}
                  onValueChange={(v) => setSetup((s) => ({ ...s, questionCount: Number(v) }))}
                  options={COUNTS.map((n) => ({ value: n, label: n }))}
                />
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="justify-between border-t pt-5">
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            <ArrowLeft /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button onClick={start} disabled={isLoading}>
              {isLoading ? <Loader2 className="animate-spin" /> : <Play />}
              {isLoading ? 'Preparing questions…' : 'Start interview'}
            </Button>
          )}
        </CardFooter>
      </Card>

      <PastInterviews />
    </>
  );
}
