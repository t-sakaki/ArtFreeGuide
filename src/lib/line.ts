import * as line from '@line/bot-sdk';

export const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

// 最新の SDK v9+ では MessagingApiClient を使用します
export const lineClient = new line.MessagingApiClient({
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
export async function replyMultipleMessages(replyToken: string, messages: line.Message[]) {
  return lineClient.replyMessage({
    replyToken: replyToken,
    messages: messages,
  });
}
