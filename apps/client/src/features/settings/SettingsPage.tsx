import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Bot, Download, KeyRound, Loader2, Mic, MonitorUp, RotateCcw, Shield, Sparkles, Trash2, User, Volume2 } from 'lucide-react';
import { ANSWER_LENGTHS, ANSWER_STYLES, type AnswerLength, type AnswerStyle } from '@aia/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Slider, Switch } from '@/components/ui/form-controls';
import { ConfirmDialog, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppDispatch, useAppSelector } from '@/store';
import { DEFAULT_SETTINGS, updateSection, type SettingsState } from '@/store/settingsSlice';
import { useUpdateSettings } from '@/hooks/useUpdateSettings';
import { useClearHistoryMutation, useExportAccountMutation } from '@/store/historyApi';
import { errorMessage } from '@/store/api';
import { capitalize } from '@/lib/format';
import { VoiceSettingsControls } from '@/features/voice/VoiceSettingsControls';
import { ProfileForm } from './ProfileForm';
import { AccountSettings } from './AccountSettings';

const TABS = ['profile', 'answers', 'voice', 'ai', 'privacy', 'account'] as const;
type Tab = (typeof TABS)[number];

const LENGTH_HINTS: Record<AnswerLength, string> = {
  short: '2–3 sentences',
  normal: '4–6 sentences',
  detailed: 'Full explanation with code',
};
const STYLE_HINTS: Record<AnswerStyle, string> = {
  conversational: 'Natural and friendly, like talking to an interviewer',
  technical: 'More precise terminology',
  concise: 'Straight to the point',
};
const RETENTION = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: '0', label: 'Keep until I delete it' },
];
const CODE_LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'csharp', 'go', 'sql'];

type Section = Exclude<keyof SettingsState, 'profile'>;

/** Read a settings section and save changes to the server (optimistic, rolled back on error). */
function useSection<S extends Section>(section: S) {
  const update = useUpdateSettings();
  const values = useAppSelector((s) => s.settings[section]);
  const dispatch = useAppDispatch();
  const set = (v: Partial<SettingsState[S]>) => void update(section, v);
  /** Local-only change (e.g. while dragging a slider); call `set` to save. */
  const preview = (v: Partial<SettingsState[S]>) => dispatch(updateSection({ section, values: v }));
  return [values, set, preview] as const;
}

function Row({ label, description, htmlFor, children }: { label: string; description?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <Label htmlFor={htmlFor}>{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0 sm:w-64 sm:text-right">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'profile';

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile, answer preferences, voice and privacy."
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList aria-label="Settings sections">
          <TabsTrigger value="profile"><User /> Profile</TabsTrigger>
          <TabsTrigger value="answers"><Sparkles /> Answers</TabsTrigger>
          <TabsTrigger value="voice"><Volume2 /> Voice</TabsTrigger>
          <TabsTrigger value="ai"><Bot /> AI model</TabsTrigger>
          <TabsTrigger value="privacy"><Shield /> Privacy</TabsTrigger>
          <TabsTrigger value="account"><KeyRound /> Account & security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Used to tailor questions and answers to you.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="answers">
          <AnswerSettings />
        </TabsContent>

        <TabsContent value="voice">
          <div className="grid gap-4 lg:grid-cols-2">
            <SpeechInputSettings />
            <Card>
              <CardHeader>
                <CardTitle>Speech output</CardTitle>
                <CardDescription>How answers are read aloud.</CardDescription>
              </CardHeader>
              <CardContent>
                <VoiceSettingsControls />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai">
          <AiSettings />
        </TabsContent>

        <TabsContent value="privacy">
          <PrivacySettings />
        </TabsContent>

        <TabsContent value="account">
          <AccountSettings />
        </TabsContent>
      </Tabs>
    </>
  );
}

function AnswerSettings() {
  const [answer, set] = useSection('answer');
  const [assistant, setAssistant, previewAssistant] = useSection('assistant');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Answer preferences</CardTitle>
        <CardDescription>Defaults for generated answers. You can still switch length on any answer.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <Row label="Default length" description={LENGTH_HINTS[answer.length]} htmlFor="answer-length">
          <Select value={answer.length} onValueChange={(v) => set({ length: v as AnswerLength })}>
            <SelectTrigger id="answer-length"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANSWER_LENGTHS.map((l) => <SelectItem key={l} value={l}>{capitalize(l)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Answer style" description={STYLE_HINTS[answer.style]} htmlFor="answer-style">
          <Select value={answer.style} onValueChange={(v) => set({ style: v as AnswerStyle })}>
            <SelectTrigger id="answer-style"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANSWER_STYLES.map((s) => <SelectItem key={s} value={s}>{capitalize(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Include code examples" description="When the question is about code" htmlFor="include-code">
          <Switch id="include-code" checked={answer.includeCodeExamples} onCheckedChange={(v) => set({ includeCodeExamples: v })} />
        </Row>
        <Row label="Code example language" htmlFor="code-language">
          <Select value={answer.codeLanguage} onValueChange={(v) => set({ codeLanguage: v })} disabled={!answer.includeCodeExamples}>
            <SelectTrigger id="code-language"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CODE_LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Auto-generate answers" description="Answer detected questions right away in the assistant" htmlFor="auto-generate">
          <Switch id="auto-generate" checked={assistant.autoGenerateAnswers} onCheckedChange={(v) => setAssistant({ autoGenerateAnswers: v })} />
        </Row>
        <Row
          label="Screen check interval"
          description={`How often the assistant looks for new text: every ${(assistant.captureIntervalMs / 1000).toFixed(0)}s`}
          htmlFor="capture-interval"
        >
          <Slider
            id="capture-interval"
            aria-label="Screen check interval in seconds"
            min={1000}
            max={10000}
            step={1000}
            value={[assistant.captureIntervalMs]}
            onValueChange={([v]) => previewAssistant({ captureIntervalMs: v! })}
            onValueCommit={([v]) => setAssistant({ captureIntervalMs: v! })}
          />
        </Row>
      </CardContent>
    </Card>
  );
}

function AiSettings() {
  const [ai, set, preview] = useSection('ai');
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>AI model</CardTitle>
        <CardDescription>
          The API key is kept on the server and is never sent to your browser. Leave the model on “Server default” unless
          you have a reason to change it.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <Row label="Model" htmlFor="ai-model">
          <Select value={ai.model || 'default'} onValueChange={(v) => set({ model: v === 'default' ? '' : (v as SettingsState['ai']['model']) })}>
            <SelectTrigger id="ai-model"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Server default</SelectItem>
              <SelectItem value="fast">Faster responses</SelectItem>
              <SelectItem value="quality">Higher quality</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row
          label="Creativity"
          description={ai.temperature <= 0.3 ? 'Precise and consistent' : ai.temperature <= 0.7 ? 'Balanced' : 'More varied wording'}
          htmlFor="ai-temperature"
        >
          <Slider
            id="ai-temperature"
            aria-label="Creativity (temperature)"
            min={0}
            max={1}
            step={0.1}
            value={[ai.temperature]}
            onValueChange={([v]) => preview({ temperature: v! })}
            onValueCommit={([v]) => set({ temperature: v! })}
          />
        </Row>
      </CardContent>
    </Card>
  );
}

function PrivacySettings() {
  const update = useUpdateSettings();
  const [privacy, setPrivacy] = useSection('privacy');
  const [permissions, setPermissions] = useSection('permissions');
  const [clearHistory] = useClearHistoryMutation();
  const [exportAccount, { isLoading: exporting }] = useExportAccountMutation();
  const [confirm, setConfirm] = useState<'history' | 'reset' | null>(null);

  const download = async () => {
    try {
      const data = await exportAccount().unwrap();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `interview-ai-data-${data.exportedAt.slice(0, 10)}.json` });
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Your data was downloaded.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not export your data. Please try again.'));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Data & retention</CardTitle>
          <CardDescription>Only text is saved. You decide how long it is kept.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <Row label="Save history" description="Store questions and answers so you can review them" htmlFor="save-history">
            <Switch id="save-history" checked={privacy.saveHistory} onCheckedChange={(v) => setPrivacy({ saveHistory: v })} />
          </Row>
          <Row label="Keep history for" htmlFor="retention">
            <Select value={String(privacy.retentionDays)} onValueChange={(v) => setPrivacy({ retentionDays: Number(v) })} disabled={!privacy.saveHistory}>
              <SelectTrigger id="retention"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RETENTION.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          {/* This version never keeps audio or screenshots, so these are facts rather than switches. */}
          <Row label="Raw audio" description="Recordings are turned into text and immediately discarded.">
            <Badge variant="success">Never stored</Badge>
          </Row>
          <Row label="Screenshots" description="Your screen is read on this device; images are never uploaded or kept.">
            <Badge variant="success">Never stored</Badge>
          </Row>
          <Row label="Your data" description="Download everything stored about you as a JSON file.">
            <Button variant="outline" size="sm" onClick={download} disabled={exporting}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export my data
            </Button>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>
            Your consent in this app. Your browser or operating system will still ask before anything is captured.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <Row label="Screen reading" description="Allow the assistant to read a screen you choose to share" htmlFor="perm-screen">
            <div className="flex items-center justify-end gap-2">
              <MonitorUp className="size-4 text-muted-foreground" />
              <Switch id="perm-screen" checked={permissions.screenCapture} onCheckedChange={(v) => setPermissions({ screenCapture: v })} />
            </div>
          </Row>
          <Row label="Microphone" description="Allow voice questions and spoken mock-interview answers" htmlFor="perm-mic">
            <div className="flex items-center justify-end gap-2">
              <Mic className="size-4 text-muted-foreground" />
              <Switch id="perm-mic" checked={permissions.microphone} onCheckedChange={(v) => setPermissions({ microphone: v })} />
            </div>
          </Row>
        </CardContent>
      </Card>

      <Card className="border-destructive/30 lg:col-span-2">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" className="text-destructive" onClick={() => setConfirm('history')}>
            <Trash2 /> Delete all history
          </Button>
          <Button variant="outline" onClick={() => setConfirm('reset')}>
            <RotateCcw /> Reset all settings
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm === 'history'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete all history?"
        description="Every saved question and answer, and all mock interviews and reports, will be permanently deleted."
        confirmLabel="Delete everything"
        destructive
        onConfirm={async () => {
          try {
            await clearHistory().unwrap();
            toast.success('History deleted');
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reset all settings?"
        description="Answer, voice, AI and privacy settings go back to their defaults. Your profile is not changed."
        confirmLabel="Reset"
        onConfirm={async () => {
          const sections = ['answer', 'voice', 'ai', 'assistant', 'privacy', 'permissions'] as const;
          const results = await Promise.all(sections.map((s) => update(s, DEFAULT_SETTINGS[s], { silent: true })));
          if (results.every(Boolean)) toast.success('Settings reset');
        }}
      />
    </div>
  );
}

const STT_LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'en-AU', label: 'English (Australia)' },
];

function SpeechInputSettings() {
  const [voice, set] = useSection('voice');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Speech input</CardTitle>
        <CardDescription>How what you say is turned into text.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2" role="radiogroup" aria-label="Speech-to-text service">
          {(
            [
              ['server', 'Our server (recommended)', 'Your recording is sent once to our server, transcribed by OpenAI and discarded. Nothing is stored. Needs AI to be set up.'],
              ['browser', "Your browser's speech service", 'Shows words as you speak and works without our AI. Your browser sends the audio to its own provider (Google for Chrome, Microsoft for Edge).'],
            ] as const
          ).map(([value, title, detail]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={voice.sttEngine === value}
              onClick={() => set({ sttEngine: value })}
              className={`rounded-lg border p-3 text-left outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 ${voice.sttEngine === value ? 'border-primary bg-accent/60' : ''}`}
            >
              <span className="block text-sm font-medium">{title}</span>
              <span className="block text-xs text-muted-foreground">{detail}</span>
            </button>
          ))}
        </div>
        <Row label="Language" htmlFor="stt-language">
          <Select value={voice.sttLanguage} onValueChange={(v) => set({ sttLanguage: v })}>
            <SelectTrigger id="stt-language"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STT_LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
      </CardContent>
    </Card>
  );
}
