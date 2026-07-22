/**
 * LINE Messaging API Client (Custom Implementation for Cloudflare Workers)
 * Using Web Crypto API and fetch to avoid Node.js dependency issues.
 */

export const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
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
    
    // Convert base64 signature to Uint8Array
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
