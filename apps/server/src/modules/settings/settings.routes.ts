import { Router } from 'express';
import type { ZodType } from 'zod';
import {
  permissionsUpdateSchema,
  preferencesUpdateSchema,
  privacyUpdateSchema,
  voiceUpdateSchema,
  type SettingsView,
} from '@aia/shared';
import { requireAuth } from '../../middleware/auth.js';
import { UserSettingsModel } from '../../models/index.js';
import { applyRetention } from '../history/history.service.js';
import { sendSuccess } from '../../utils/http.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

type Doc = Record<string, unknown> & Partial<SettingsView>;

export function toView(doc: Doc): SettingsView {
  const { theme, answer, voice, ai, assistant, privacy, permissions } = doc as SettingsView;
  return {
    theme,
    answer,
    voice: {
      ...voice,
      voiceName: voice.voiceName ?? '',
      sttEngine: voice.sttEngine ?? 'server',
      ttsEngine: voice.ttsEngine ?? 'browser',
      aiVoice: voice.aiVoice ?? 'alloy',
    },
    ai: { ...ai, model: ai.model ?? '' },
    assistant,
    privacy,
    permissions: { screenCapture: permissions.screenCapture, microphone: permissions.microphone },
  };
}

export async function getOrCreate(userId: string) {
  return UserSettingsModel.findOneAndUpdate(
    { userId },
    {},
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean<Doc>();
}

/** Flatten `{ answer: { length: 'short' } }` into `{ 'answer.length': 'short' }` so a PATCH never wipes sibling fields. */
function toDotted(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, toDotted(v as Record<string, unknown>, `${prefix}${k}.`));
    else if (v !== undefined) out[`${prefix}${k}`] = v;
  }
  return out;
}

settingsRouter.get('/', async (req, res) => {
  sendSuccess(res, toView((await getOrCreate(req.user!.id))!));
});

function patchSection(path: string, section: string | null, schema: ZodType) {
  settingsRouter.patch(path, async (req, res) => {
    const values = schema.parse(req.body) as Record<string, unknown>;
    const update = toDotted(section ? { [section]: values } : values);
    if (section === 'permissions') update['permissions.updatedAt'] = new Date();
    const doc = await UserSettingsModel.findOneAndUpdate(
      { userId: req.user!.id },
      { $set: update },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
    ).lean<Doc>();
    if (section === 'privacy' && typeof values.retentionDays === 'number') await applyRetention(req.user!.id, values.retentionDays);
    sendSuccess(res, toView(doc!));
  });
}

patchSection('/preferences', null, preferencesUpdateSchema); // theme, answer, ai, assistant
patchSection('/voice', 'voice', voiceUpdateSchema);
patchSection('/privacy', 'privacy', privacyUpdateSchema);
patchSection('/permissions', 'permissions', permissionsUpdateSchema);
