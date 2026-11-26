import { useEffect, useState } from 'react';
import { Bug, Code2, Loader2, Repeat, Sparkles } from 'lucide-react';
import type { AnswerLength } from '@aia/shared';
import { AnswerCard, CodeBlock } from '@/components/answer/AnswerCard';
import { CodeAnalysisView } from '@/components/answer/CodeAnalysisView';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/form-controls';
import { useAiAnswer } from '@/hooks/useAiAnswer';
import { useAppSelector } from '@/store';
import { errorCode, errorMessage } from '@/store/api';
import { aiErrorCopy, useAnalyzeCodeMutation } from '@/store/aiApi';
import type { Detection } from '@/lib/screen/screenReader';

/** The selected detection: editable question + AI answer, or code/error + AI review. */
export function DetectionDetail({ detection }: { detection: Detection }) {
  const settings = useAppSelector((s) => s.settings);
  const [draft, setDraft] = useState(detection.question ?? '');
  const [asked, setAsked] = useState<string | null>(null);
  const [length, setLength] = useState<AnswerLength>(settings.answer.length);
  const answer = useAiAnswer(asked, length, { source: 'assistant', inputMode: 'screen' });
  const [analyze, review] = useAnalyzeCodeMutation();

  // Each new detection: reset, and answer straight away if the user turned that on.
  useEffect(() => {
    setDraft(detection.question ?? '');
    setAsked(detection.question && settings.assistant.autoGenerateAnswers ? detection.question : null);
    review.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detection.id]);

  const codeOrError = detection.code ?? (detection.kind === 'error' ? detection.text : null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {detection.kind === 'question' && <Badge>Question</Badge>}
        {detection.kind === 'code' && (
          <Badge variant="secondary">
            <Code2 /> Code{detection.language ? ` · ${detection.language}` : ''}
          </Badge>
        )}
        {detection.kind === 'error' && (
          <Badge variant="destructive">
            <Bug /> Error
          </Badge>
        )}
        {detection.repeated && (
          <Badge variant="warning">
            <Repeat /> Seen earlier
          </Badge>
        )}
        {detection.keywords.slice(0, 5).map((k) => (
          <Badge key={k} variant="outline" className="font-normal">
            {k}
          </Badge>
        ))}
      </div>

      {detection.question !== null && (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim().length >= 5) setAsked(draft.trim());
          }}
        >
          <Label htmlFor="detected-question">Detected question (you can edit it)</Label>
          <Textarea id="detected-question" rows={2} value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={draft.trim().length < 5 || answer.isLoading}>
              <Sparkles /> {asked ? 'Answer again' : 'Get answer'}
            </Button>
          </div>
        </form>
      )}

      {asked && <AnswerCard question={asked} length={length} onLengthChange={setLength} compact {...answer} />}

      {codeOrError && (
        <div className="space-y-3">
          <CodeBlock language={detection.language ?? (detection.kind === 'error' ? 'error' : 'code')} code={codeOrError} />
          {!review.data && (
            <Button
              variant="outline"
              size="sm"
              disabled={review.isLoading}
              onClick={() =>
                analyze({
                  code: codeOrError.slice(0, 10_000),
                  ...(detection.language ? { language: detection.language } : {}),
                  ...(detection.question ? { task: detection.question.slice(0, 500) } : {}),
                })
              }
            >
              {review.isLoading ? <Loader2 className="animate-spin" /> : <Code2 />}
              {detection.kind === 'error' ? 'Explain this error' : 'Review this code'}
            </Button>
          )}
          {review.error ? (
            <p role="alert" className="text-sm text-destructive-text">
              {aiErrorCopy(errorCode(review.error), errorMessage(review.error, 'Could not review the code.')).description}
            </p>
          ) : null}
          {review.data && <CodeAnalysisView data={review.data} />}
        </div>
      )}
    </div>
  );
}
