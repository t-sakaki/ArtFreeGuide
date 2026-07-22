import * as line from '@line/bot-sdk';

export const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

export const lineClient = new line.Client(lineConfig);

/**
 * LINEユーザーにテキストメッセージを返信する
 */
export async function replyTextMessage(replyToken: string, text: string) {
  return lineClient.replyMessage(replyToken, {
    type: 'text',
    text: text,
  });
}

/**
 * LINEユーザーに複数のメッセージ（テキスト + 詳細など）を送信する
 */
export async function replyMultipleMessages(replyToken: string, messages: line.Message[]) {
  return lineClient.replyMessage(replyToken, messages);
}
