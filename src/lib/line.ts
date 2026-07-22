import { messagingApi, validateSignature } from '@line/bot-sdk';

export const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

// SDK v9+ では messagingApi を使用してクライアントを作成します
export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

/**
 * LINEユーザーにテキストメッセージを返信する
 */
export async function replyTextMessage(replyToken: string, text: string) {
  return lineClient.replyMessage({
    replyToken: replyToken,
    messages: [{ type: 'text', text: text }],
  });
}

/**
 * LINEユーザーに複数のメッセージを送信する
 */
export async function replyMultipleMessages(replyToken: string, messages: any[]) {
  return lineClient.replyMessage({
    replyToken: replyToken,
    messages: messages,
  });
}
