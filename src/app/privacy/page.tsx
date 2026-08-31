import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';

const TITLE = 'プライバシーポリシー | ArtFreeGuide';
const DESCRIPTION =
  'ArtFreeGuide（AI美術館音声ガイド）における利用者情報の取り扱いについて定めたプライバシーポリシーです。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/privacy`,
  },
  robots: { index: true, follow: true },
};

const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: '1. はじめに',
    body: (
      <p>
        ArtFreeGuide（以下「本サービス」）は、AIによる美術作品の音声解説を提供するウェブアプリケーションです。
        本サービスの運営者（以下「当運営者」）は、本サービスを通じて取得した利用者の情報を、
        本ポリシーに従って適切に取り扱います。
      </p>
    ),
  },
  {
    heading: '2. 収集する情報',
    body: (
      <>
        <p>本サービスでは、以下の情報を収集・処理します。</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>入力テキスト</strong>：作品名や質問など、利用者が入力欄に入力したテキスト。解説生成のために処理されます。
          </li>
          <li>
            <strong>写真（カメラ画像）</strong>：作品の特定を目的として一時的に処理されます。写真は作品認識のための解析にのみ使用され、永続的に保存しません。
          </li>
          <li>
            <strong>閲覧履歴</strong>：どの作品の解説が閲覧されたかなどの記録で、Supabase に保存され、解説の品質改善や次の来訪者へのフィードバック反映のために利用します。
          </li>
          <li>
            <strong>解説キャッシュ</strong>：一度生成された作品解説は、Cloudflare D1（データベース）にキャッシュとして保存され、以後の来訪者に高速に提供されます。
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: '3. 第三者への提供（外部サービスの利用）',
    body: (
      <>
        <p>
          本サービスは機能提供のため、以下の第三者サービスを利用しており、処理に必要な範囲で情報を送信することがあります。
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>NVIDIA NIM API</strong>：作品名・質問・写真から得た情報をプロンプトとして送信し、解説を生成します。
          </li>
          <li>
            <strong>Supabase</strong>：入力テキスト、閲覧履歴、ユーザー識別子などを保存します。
          </li>
          <li>
            <strong>Wikimedia Commons / Wikidata API</strong>：作品画像の取得や作品情報の検索に利用します。
          </li>
          <li>
            <strong>Cloudflare</strong>：ホスティング、D1 キャッシュ、画像配信などに利用します。
          </li>
        </ul>
        <p>
          音声入力は端末内 Web Speech API を使用します（サーバ送信なし）。ただし、ブラウザによっては Web Speech API がクラウド音声認識にフォールバックする場合があるため、実装確認が必要です。
        </p>
      </>
    ),
  },
  {
    heading: '4. データの保持と削除',
    body: (
      <>
        <p>
          収集した情報は、利用目的を達成した後、または利用者から削除リクエストがあった場合に削除します。
        </p>
        <p>
          データの削除をリクエストできる窓口は、メールアドレス
          <strong>taira.sakakibara@gmail.com</strong> です。
        </p>
        <p>
          プライバシーポリシーの制定日：<strong>2026年8月29日</strong>
        </p>
      </>
    ),
  },
  {
    heading: '5. 対象年齢',
    body: (
      <p>
        本サービスは全年齢を対象としています。子ども向けコンテンツとして申告するかは開発者判断ですが、UGC（質問・指摘の公開反映）があるため、不適切コンテンツ対策の方針を用意しておくことを推奨します。
      </p>
    ),
  },
  {
    heading: '6. 準拠法',
    body: (
      <p>
        本ポリシーは日本法に準拠します。
      </p>
    ),
  },
];

export default function Privacy() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-bold mb-4">{TITLE}</h1>
      <div className="space-y-6">
        {SECTIONS.map((section, index) => (
          <div key={index} className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-2">{section.heading}</h2>
            <div className="prose prose-invert max-w-none">{section.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}