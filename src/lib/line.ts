/**
 * LINE Messaging API Client (Custom Lightweight Implementation for Edge/Cloudflare Workers)
 * Uses Web Crypto API and native fetch to eliminate heavyweight Node.js dependencies.
 */

export const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
  appBaseUrl: process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://art-free-guide-staging.taira-sakakibara.workers.dev',
};

/**
 * Verify LINE webhook signature using Web Crypto API (HMAC-SHA256)
 */
export async function verifyLineSignature(
  bodyText: string,
  signature: string | null,
  channelSecret: string
): Promise<boolean> {
  if (!signature || !channelSecret) return false;
  try {
    const trimmed = signature.trim();
    if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
      return false;
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(channelSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = Uint8Array.from(atob(trimmed), (c) => c.charCodeAt(0));
    const bodyBytes = encoder.encode(bodyText);

    return await crypto.subtle.verify('HMAC', key, signatureBytes, bodyBytes);
  } catch (e) {
    console.error('[LINE] Signature verification error:', e);
    return false;
  }
}

/**
 * Send reply messages to LINE Messaging API using standard fetch
 */
export async function replyMultipleMessages(replyToken: string, messages: any[]) {
  if (!lineConfig.channelAccessToken) {
    console.warn('[LINE] LINE_CHANNEL_ACCESS_TOKEN is missing. Skipping reply.');
    return { ok: false, status: 400, message: 'Missing channelAccessToken' };
  }

  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lineConfig.channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken: replyToken,
      messages: messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[LINE] API Error ${response.status}: ${errorText}`);
    throw new Error(`LINE API Error: ${response.status} ${errorText}`);
  }

  return response;
}

/**
 * Reply with a single text message to LINE user
 */
export async function replyTextMessage(replyToken: string, text: string) {
  return replyMultipleMessages(replyToken, [{ type: 'text', text }]);
}

/**
 * Reply with an audio message to LINE user
 * LINE Audio Message format requires originalContentUrl (HTTPS MP3) and duration in milliseconds
 */
export async function replyAudioMessage(replyToken: string, audioUrl: string, durationMs: number) {
  const safeDuration = Math.max(1000, Math.round(durationMs));
  return replyMultipleMessages(replyToken, [
    {
      type: 'audio',
      originalContentUrl: audioUrl,
      duration: safeDuration,
    },
  ]);
}

/**
 * Create a Flex Message for Audio Guide web app induction
 */
export function createAudioGuideFlex(artworkName: string, customUrl?: string) {
  const url = customUrl || `${lineConfig.appBaseUrl}/?work=${encodeURIComponent(artworkName)}`;

  return {
    type: 'flex',
    altText: '音声ガイドで聴く',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🎧 音声ガイドで体験する',
            weight: 'bold',
            size: 'md',
            align: 'center',
            margin: 'md',
          },
          {
            type: 'text',
            text: `「${artworkName}」の物語を、心ゆくまで音声で堪能してください。`,
            wrap: true,
            size: 'sm',
            align: 'center',
            margin: 'sm',
            color: '#666666',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '今すぐ聴く',
              uri: url,
            },
            style: 'primary',
            color: '#E67E22',
            margin: 'md',
          },
        ],
      },
    },
  };
}
