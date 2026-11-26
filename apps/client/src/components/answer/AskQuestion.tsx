import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { AnswerLength, AnswerSource } from '@aia/shared';
import { AnswerCard } from '@/components/answer/AnswerCard';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/form-controls';
import { useAppSelector } from '@/store';
import { useAiAnswer } from '@/hooks/useAiAnswer';

/**
 * Type or paste a question and get a structured answer. Used by the screen and voice
 * assistants as the manual fallback (and as the target for detected questions later).
 */
export function AskQuestion({
  id = 'ask',
  initialQuestion = '',
  source,
}: {
  id?: string;
  initialQuestion?: string;
  /** Which history section typed questions are saved under. */
  source: AnswerSource;
}) {
  const defaultLength = useAppSelector((s) => s.settings.answer.length);
  const [text, setText] = useState(initialQuestion);
  const [asked, setAsked] = useState<string | null>(null);
  const [length, setLength] = useState<AnswerLength>(defaultLength);
  const [error, setError] = useState<string>();

  const answer = useAiAnswer(asked, length, { source, inputMode: 'text' });

  const ask = () => {
    const q = text.trim();
    if (q.length < 5) {
      setError('Enter a question (at least 5 characters).');
      return;
    }
    setAsked(q);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor={id}>Question</Label>
        <Textarea
          id={id}
          rows={3}
          value={text}
          maxLength={2000}
          aria-invalid={!!error}
          placeholder="Type or paste an interview question…"
          onChange={(e) => {
            setError(undefined);
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask();
          }}
        />
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Tip: press Ctrl/⌘ + Enter to ask.</p>
          <Button onClick={ask} disabled={answer.isLoading}>
            <Sparkles /> Get answer
          </Button>
        </div>
      </div>

      {asked && (
        <AnswerCard question={asked} length={length} onLengthChange={setLength} {...answer} />
      )}
    </div>
  );
}
