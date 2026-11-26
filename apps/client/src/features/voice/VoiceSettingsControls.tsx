import { Loader2, Pause, Play, Square, Volume2 } from 'lucide-react';
import { AI_VOICES, type AiVoice, type TtsEngine } from '@aia/shared';
import { Button } from '@/components/ui/button';
import { Label, Slider } from '@/components/ui/form-controls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSpeech } from '@/hooks/useSpeech';
import { useAppDispatch, useAppSelector } from '@/store';
import { updateSection } from '@/store/settingsSlice';
import { useUpdateSettings } from '@/hooks/useUpdateSettings';

const SAMPLE_TEXT =
  "Hi! This is how your interview answers will sound. You can change the voice and speed until it feels natural.";

/** Voice, speed and pitch controls bound to settings, with a live preview. Reused on the Settings page. */
export function VoiceSettingsControls() {
  const dispatch = useAppDispatch();
  const voice = useAppSelector((s) => s.settings.voice);
  const speech = useSpeech();
  const update = useUpdateSettings();
  // Selects save immediately; sliders preview locally while dragging and save on release.
  const set = (values: Partial<typeof voice>) => void update('voice', values);
  const preview = (values: Partial<typeof voice>) => dispatch(updateSection({ section: 'voice', values }));

  if (!speech.supported) {
    return <p className="text-sm text-muted-foreground">Text-to-speech is not supported in this browser.</p>;
  }

  const englishFirst = [...speech.voices].sort((a, b) => Number(b.lang.startsWith('en')) - Number(a.lang.startsWith('en')));
  const ai = voice.ttsEngine === 'ai';

  return (
    <div className="space-y-5">
      <div className="grid gap-2">
        <Label htmlFor="tts-engine">Voice type</Label>
        <Select value={voice.ttsEngine} onValueChange={(v) => set({ ttsEngine: v as TtsEngine })}>
          <SelectTrigger id="tts-engine">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="browser">Browser voices (free, on this device)</SelectItem>
            <SelectItem value="ai">Natural AI voice</SelectItem>
          </SelectContent>
        </Select>
        {ai && <p className="text-xs text-muted-foreground">The answer text is sent to our server to create the audio.</p>}
      </div>

      {ai ? (
        <div className="grid gap-2">
          <Label htmlFor="ai-voice">AI voice</Label>
          <Select value={voice.aiVoice} onValueChange={(v) => set({ aiVoice: v as AiVoice })}>
            <SelectTrigger id="ai-voice">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_VOICES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="voice-name">Voice</Label>
          <Select value={voice.voiceName || 'default'} onValueChange={(v) => set({ voiceName: v === 'default' ? '' : v })}>
            <SelectTrigger id="voice-name">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="default">System default</SelectItem>
              {englishFirst.map((v) => (
                <SelectItem key={v.voiceURI} value={v.name}>
                  {v.name} ({v.lang})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="voice-rate">Speed</Label>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{voice.rate.toFixed(2)}×</span>
        </div>
        <Slider
          id="voice-rate"
          aria-label="Speech speed"
          min={0.5}
          max={2}
          step={0.05}
          value={[voice.rate]}
          onValueChange={([v]) => preview({ rate: v! })}
          onValueCommit={([v]) => set({ rate: v! })}
        />
      </div>

      {!ai && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="voice-pitch">Pitch</Label>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{voice.pitch.toFixed(2)}</span>
          </div>
          <Slider
            id="voice-pitch"
            aria-label="Speech pitch"
            min={0}
            max={2}
            step={0.05}
            value={[voice.pitch]}
            onValueChange={([v]) => preview({ pitch: v! })}
            onValueCommit={([v]) => set({ pitch: v! })}
          />
        </div>
        )}

      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Preview playback">
        {speech.state === 'idle' && (
          <Button variant="outline" onClick={() => speech.speak(SAMPLE_TEXT)}>
            <Volume2 /> Preview voice
          </Button>
        )}
        {speech.state === 'loading' && (
          <Button variant="outline" disabled>
            <Loader2 className="animate-spin" /> Preparing voice…
          </Button>
        )}
        {speech.state === 'speaking' && (
          <Button variant="outline" onClick={speech.pause}>
            <Pause /> Pause
          </Button>
        )}
        {speech.state === 'paused' && (
          <Button variant="outline" onClick={speech.resume}>
            <Play /> Resume
          </Button>
        )}
        {speech.state !== 'idle' && (
          <Button variant="ghost" onClick={speech.stop}>
            <Square /> Stop
          </Button>
        )}
      </div>
    </div>
  );
}
