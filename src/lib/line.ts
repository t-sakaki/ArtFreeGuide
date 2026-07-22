/**
 * LINE Messaging API Client (Custom Implementation for Cloudflare Workers)
 * Using Web Crypto API and fetch to avoid Node.js dependency issues.
 */

export const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
  // Base URL for the Web App to link to audio guides
  appBaseUrl: 'https://art-free-guide-trial.taira-sakakibara.workers.dev',
};

/**
 * Verify LINE signature using Web Crypto API
 */
export async function verifyLineSignature(bodyText: string, signature: string | null, channelSecret: string): Promise<boolean> {
  if (!signature || !channelSecret) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(channelSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const signatureBytes = Uint8Array.from(atob(signature.trim()), c => c.charCodeAt(0));
    const bodyBytes = encoder.encode(bodyText);
    
    return await crypto.subtle.verify('HMAC', key, signatureBytes, bodyBytes);
  } catch (e) {
    console.error('Signature verification failed:', e);
    return false;
  }
}

/**
 * Reply to LINE user using standard fetch API
 */
export async function replyTextMessage(replyToken: string, text: string) {
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lineConfig.channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: text }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API Error: ${response.status} ${errorText}`);
  }

  return response;
}

/**
 * Send multiple messages to LINE user
 */
export async function replyMultipleMessages(replyToken: string, messages: any[]) {
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lineConfig.channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken: replyToken,
      messages: messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API Error: ${response.status} ${errorText}`);
  }

  return response;
}

/**
 * Create a Flex Message for Audio Guide induction
 */
export function createAudioGuideFlex(artworkName: string) {
  const url = `${lineConfig.appBaseUrl}/?work=${encodeURIComponent(artworkName)}`;
  
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
            margin: 'md'
          },
          {
            type: 'text',
            text: `「${artworkName}」の物語を、心ゆくまで音声で堪能してください。`,
            wrap: true,
            size: 'sm',
            align: 'center',
            margin: 'sm',
            color: '#666666'
          }
        ]
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
              uri: url
            },
            style: 'primary',
            color: '#E67E22',
            margin: 'md'
          }
        ]
      }
    }
  };
}
