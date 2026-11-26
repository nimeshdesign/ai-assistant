import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertCircle, AlertTriangle, BookOpen, Code2, Lightbulb, Loader2, MessageCircleQuestion, Sparkles } from 'lucide-react';
import {
  analyzeCodeRequestSchema,
  explainRequestSchema,
  type ConceptExplanation,
} from '@aia/shared';
import { AskQuestion } from '@/components/answer/AskQuestion';
import { CodeBlock } from '@/components/answer/AnswerCard';
import { CodeAnalysisView } from '@/components/answer/CodeAnalysisView';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/form-controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays';
import { Skeleton } from '@/components/ui/skeleton';
import { errorCode, errorMessage } from '@/store/api';
import { aiErrorCopy, useAnalyzeCodeMutation, useExplainConceptMutation, useGetAiStatusQuery } from '@/store/aiApi';

const TABS = ['ask', 'explain', 'code'] as const;
type Tab = (typeof TABS)[number];

export default function ToolsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'ask';
  const { data: status } = useGetAiStatusQuery();

  return (
    <>
      <PageHeader title="AI Tools" description="Ask a question, understand a concept, or get a code review." />
      {status && !status.configured && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-text" />
          <p>
            <span className="font-medium">AI is not set up on this server yet.</span>{' '}
            <span className="text-muted-foreground">Add OPENAI_API_KEY to apps/server/.env and restart the server.</span>
          </p>
        </div>
      )}
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList aria-label="AI tools">
          <TabsTrigger value="ask">
            <MessageCircleQuestion /> Ask
          </TabsTrigger>
          <TabsTrigger value="explain">
            <BookOpen /> Explain a concept
          </TabsTrigger>
          <TabsTrigger value="code">
            <Code2 /> Analyse code
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ask">
          <Card>
            <CardContent>
              <AskQuestion id="tools-question" source="practice" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="explain">
          <ExplainPanel />
        </TabsContent>
        <TabsContent value="code">
          <AnalyzePanel />
        </TabsContent>
      </Tabs>
    </>
  );
}

function AiError({ error }: { error: unknown }) {
  const copy = aiErrorCopy(errorCode(error), errorMessage(error, 'Please try again.'));
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive-text" />
      <div>
        <p className="font-medium">{copy.title}</p>
        <p className="text-muted-foreground">{copy.description}</p>
      </div>
    </div>
  );
}

// ---------------- Explain ----------------

function ExplainPanel() {
  const [concept, setConcept] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [explain, { data, error, isLoading, reset }] = useExplainConceptMutation();

  const submit = () => {
    const parsed = explainRequestSchema.safeParse({ concept });
    if (!parsed.success) return setFieldError(parsed.error.issues[0]?.message);
    reset();
    void explain(parsed.data);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="lg:self-start">
        <CardHeader>
          <CardTitle>Explain a concept</CardTitle>
          <CardDescription>Get a simple explanation, an analogy and the key points to remember.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field label="Concept" htmlFor="concept" error={fieldError}>
              <Input
                id="concept"
                placeholder="e.g. event loop, CAP theorem, React reconciliation"
                value={concept}
                maxLength={200}
                aria-invalid={!!fieldError}
                onChange={(e) => {
                  setFieldError(undefined);
                  setConcept(e.target.value);
                }}
              />
            </Field>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="animate-spin" /> : <Sparkles />} Explain
            </Button>
          </form>
        </CardContent>
      </Card>

      <div aria-live="polite">
        {isLoading ? (
          <Card>
            <CardContent className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ) : error ? (
          <AiError error={error} />
        ) : data ? (
          <ExplanationView data={data} />
        ) : (
          <EmptyHint icon={BookOpen} text="Type a concept to get a clear, interview-friendly explanation." />
        )}
      </div>
    </div>
  );
}

function ExplanationView({ data }: { data: ConceptExplanation }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{data.title}</CardTitle>
        <CardDescription className="text-base text-foreground">{data.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm leading-relaxed">
        <p>{data.explanation}</p>
        <div className="rounded-lg bg-accent/50 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-accent-foreground uppercase">
            <Lightbulb className="size-3.5" /> Think of it like this
          </p>
          <p>{data.analogy}</p>
        </div>
        {data.keyPoints.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Key points</p>
            <ul className="space-y-1.5">
              {data.keyPoints.map((k) => (
                <li key={k} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {k}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.example && <CodeBlock language={data.example.language} code={data.example.code} />}
      </CardContent>
    </Card>
  );
}

// ---------------- Analyse code ----------------

function AnalyzePanel() {
  const [code, setCode] = useState('');
  const [task, setTask] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [analyze, { data, error, isLoading, reset }] = useAnalyzeCodeMutation();

  const submit = () => {
    const parsed = analyzeCodeRequestSchema.safeParse({ code, ...(task.trim() ? { task } : {}) });
    if (!parsed.success) return setFieldError(parsed.error.issues[0]?.message);
    reset();
    void analyze(parsed.data);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="xl:self-start">
        <CardHeader>
          <CardTitle>Analyse code</CardTitle>
          <CardDescription>Finds bugs, edge cases and performance problems, and suggests a fix.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field label="Code" htmlFor="code-input" error={fieldError} hint={`${code.length.toLocaleString()} / 10,000 characters`}>
              <Textarea
                id="code-input"
                rows={14}
                spellCheck={false}
                className="font-mono text-[13px]"
                placeholder="Paste your code here…"
                value={code}
                aria-invalid={!!fieldError}
                onChange={(e) => {
                  setFieldError(undefined);
                  setCode(e.target.value);
                }}
              />
            </Field>
            <Field label="What should it do? (optional)" htmlFor="code-task">
              <Input id="code-task" maxLength={500} placeholder="e.g. Return the two numbers that add up to a target" value={task} onChange={(e) => setTask(e.target.value)} />
            </Field>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="animate-spin" /> : <Sparkles />} Analyse
            </Button>
          </form>
        </CardContent>
      </Card>

      <div aria-live="polite">
        {isLoading ? (
          <Card>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        ) : error ? (
          <AiError error={error} />
        ) : data ? (
          <CodeAnalysisView data={data} />
        ) : (
          <EmptyHint icon={Code2} text="Paste a solution to get a review like you would in a coding interview." />
        )}
      </div>
    </div>
  );
}

function EmptyHint({ icon: Icon, text }: { icon: typeof Code2; text: string }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      <Icon className="size-6" />
      {text}
    </div>
  );
}
