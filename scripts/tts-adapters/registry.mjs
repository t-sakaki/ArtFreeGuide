import { elevenlabsAdapter } from './elevenlabs.mjs';
import { azureAdapter } from './azure.mjs';
import { geminiAdapter } from './gemini.mjs';

const ADAPTERS = new Map([
  [elevenlabsAdapter.id, elevenlabsAdapter],
  [azureAdapter.id, azureAdapter],
  [geminiAdapter.id, geminiAdapter],
]);

export function listTtsProviders() {
  return [...ADAPTERS.keys()];
}

export function getTtsAdapter(providerName) {
  const key = String(providerName || '').trim().toLowerCase();
  const adapter = ADAPTERS.get(key);
  if (!adapter) {
    throw new Error(
      `Unknown TTS provider "${providerName}". Available providers: ${listTtsProviders().join(', ')}`,
    );
  }
  return adapter;
}

function pickDeterministicVoice(rawVoiceSpec, artworkId = '', locale = '') {
  const candidates = String(rawVoiceSpec || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (candidates.length === 0) return '';
  if (candidates.length === 1 || !artworkId) return candidates[0];

  // FNV-1a 32-bit hash so each artwork gets a stable voice across modes and reruns
  const key = `${artworkId}:${locale}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return candidates[hash % candidates.length];
}

export function resolveJobTtsConfig(opts, locale, artworkId = '') {
  const provider =
    (opts.providerOverrides?.[locale] || opts.provider || 'elevenlabs').toLowerCase();
  const adapter = getTtsAdapter(provider);

  const rawVoiceSpec =
    opts.voiceOverrides?.[locale] ||
    opts.voiceId ||
    adapter.defaultVoiceByLocale?.[locale] ||
    Object.values(adapter.defaultVoiceByLocale || {})[0] ||
    '';
  const voiceId = pickDeterministicVoice(rawVoiceSpec, artworkId, locale);

  const modelId =
    opts.modelOverrides?.[locale] ||
    opts.modelId ||
    adapter.defaultModelId;

  const outputFormat =
    opts.formatOverrides?.[locale] ||
    opts.format ||
    adapter.defaultOutputFormat;

  const voiceSettings = {
    ...(adapter.defaultVoiceSettings || {}),
    ...(opts.voiceSettingsOverrides || {}),
  };

  return {
    adapter,
    provider: adapter.id,
    voiceId,
    modelId,
    outputFormat,
    voiceSettings,
  };
}
