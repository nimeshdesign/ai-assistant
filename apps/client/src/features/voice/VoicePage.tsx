import { useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { analyzeScreenText, type AnswerLength } from '@aia/shared';
import { AnswerCard } from '@/components/answer/AnswerCard';
import { AskQuestion } from '@/components/answer/AskQuestion';
import { PageHeader } from '@/components/common/PageHeader';
import { MicConsentDialog, MicControl, SpeechMetricsSummary, SttEngineNote } from '@/components/voice/VoiceControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Switch, Textarea } from '@/components/ui/form-controls';
import { useAiAnswer } from '@/hooks/useAiAnswer';
import { useUpdateSettings } from '@/hooks/useUpdateSettings';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useAppSelector } from '@/store';
import { VoiceSettingsControls } from './VoiceSettingsControls';

/** Leading hesitations and discourse markers: "Um, so, okay — what is…". */
const LEADING_FILLERS = /^(?:(?:um+|uh+|er+|erm|hmm+|so|okay|ok|well|right|alright|like|and|yeah|basically)\b[\s,.…-]*)+/i;

/** Spoken input often wraps the question in chat ("Okay so, um, what is…"); keep just the question if we can find it. */
export function questionFromSpeech(text: string): string {
  const q = (analyzeScreenText(text).question ?? text).trim().replace(LEADING_FILLERS, '').trim();
  return q ? q.charAt(0).toUpperCase() + q.slice(1) : text.trim();
}

export default function VoicePage() {
  const update = useUpdateSettings();
  const autoSpeak = useAppSelector((s) => s.settings.voice.autoSpeakAnswers);
  const defaultLength = useAppSelector((s) => s.settings.answer.length);
  const [consentOpen, setConsentOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [length, setLength] = useState<AnswerLength>(defaultLength);
  const answer = useAiAnswer(asked, length, { source: 'voice', inputMode: 'voice' });

  const voice = useVoiceInput({
    mode: 'question',
    onResult: (r) => {
      const q = questionFromSpeech(r.text);
      setDraft(q);
      setAsked(q.length >= 5 ? q : null);
    },
  });

  return (
    <>
      <PageHeader title="Voice Assistant" description="Ask a question out loud and hear a natural, interview-ready answer." />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ask by voice</CardTitle>
              <CardDescription>Speak your question — it's turned into text and answered.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <MicControl voice={voice} onRequestConsent={() => setConsentOpen(true)} />
              {voice.interim && (
                <p className="rounded-md bg-muted/60 p-2 text-sm text-muted-foreground italic" aria-live="polite">
                  {voice.interim}
                </p>
              )}
              {voice.error && (
                <p role="alert" className="text-sm text-destructive-text">
                  {voice.error}
                </p>
              )}
              <SttEngineNote engine={voice.engine} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Speech output</CardTitle>
              <CardDescription>How answers are read aloud.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <VoiceSettingsControls />
              <div className="flex items-center justify-between gap-4 border-t pt-4">
                <Label htmlFor="auto-speak" className="font-normal">
                  Read answers aloud automatically
                </Label>
                <Switch id="auto-speak" checked={autoSpeak} onCheckedChange={(v) => void update('voice', { autoSpeakAnswers: v })} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {voice.result ? (
            <Card>
              <CardHeader className="flex-row items-start justify-between">
                <div className="space-y-1">
                  <CardTitle>You asked</CardTitle>
                  <CardDescription>Fix anything that was misheard, then ask again.</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    voice.reset();
                    setAsked(null);
                    setDraft('');
                  }}
                >
                  <RotateCcw /> Start over
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  className="grid gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (draft.trim().length >= 5) setAsked(draft.trim());
                  }}
                >
                  <Label htmlFor="spoken-question" className="sr-only">
                    Your question
                  </Label>
                  <Textarea id="spoken-question" rows={2} value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={draft.trim().length < 5 || answer.isLoading}>
                      <Sparkles /> Ask again
                    </Button>
                  </div>
                </form>
                {voice.result.text !== draft && (
                  <p className="text-xs text-muted-foreground">
                    Heard: “{voice.result.text}”
                  </p>
                )}
                <SpeechMetricsSummary metrics={voice.result.metrics} />
              </CardContent>
            </Card>
          ) : null}

          {asked && <AnswerCard question={asked} length={length} onLengthChange={setLength} {...answer} />}

          <Card>
            <CardHeader>
              <CardTitle>Or type a question</CardTitle>
            </CardHeader>
            <CardContent>
              <AskQuestion id="voice-question" source="voice" />
            </CardContent>
          </Card>
        </div>
      </div>

      <MicConsentDialog open={consentOpen} onOpenChange={setConsentOpen} onAllow={() => void voice.start()} />
    </>
  );
}
