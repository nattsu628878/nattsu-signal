import { XMLParser } from 'fast-xml-parser';

// note/QiitaはどちらもCORSヘッダーを返さないため、Blueskyのようなクライアント側fetchは
// ブラウザにブロックされる。よってここはビルド時（GitHub Actions上のNode）で取得する。
// 静的サイトなので新着はリビルドまで出ない → 投稿したらdeploy workflowを手動実行する。

export type Article = {
  title: string;
  url: string;
  date: string; // ISO
  source: 'note' | 'Qiita';
};

const NOTE_USER = 'nattsu_628878';
const QIITA_USER = 'nattsu';

const TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchNote(): Promise<Article[]> {
  const res = await fetchWithTimeout(`https://note.com/${NOTE_USER}/rss`);
  if (!res.ok) throw new Error(`note RSS ${res.status}`);

  const parser = new XMLParser({ ignoreAttributes: true });
  const feed = parser.parse(await res.text());
  const items = feed?.rss?.channel?.item;
  if (!items) return []; // 記事0件のとき<item>自体が無い

  return (Array.isArray(items) ? items : [items]).map((item: any) => ({
    title: String(item.title ?? '').trim(),
    url: String(item.link ?? ''),
    date: new Date(item.pubDate).toISOString(),
    source: 'note' as const,
  }));
}

async function fetchQiita(): Promise<Article[]> {
  // 認証なしで公開記事を読める（未認証は60req/hだが、ビルド時に1回だけなので十分）
  const res = await fetchWithTimeout(
    `https://qiita.com/api/v2/users/${QIITA_USER}/items?per_page=20`
  );
  if (res.status === 404) return []; // アカウント未作成のうちは空で通す
  if (!res.ok) throw new Error(`Qiita API ${res.status}`);

  const items: any[] = await res.json();
  return items
    .filter((item) => !item.private)
    .map((item) => ({
      title: String(item.title ?? '').trim(),
      url: String(item.url ?? ''),
      date: new Date(item.created_at).toISOString(),
      source: 'Qiita' as const,
    }));
}

/**
 * note・Qiitaの投稿を1つの新しい順リストにまとめる。
 * 片方が落ちてもビルド全体は止めず、取れた分だけ返す。
 */
export async function getArticles(): Promise<Article[]> {
  const results = await Promise.allSettled([fetchNote(), fetchQiita()]);

  const articles: Article[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    } else {
      console.warn('[articles] 取得に失敗したソースがあります:', result.reason);
    }
  }

  return articles.sort((a, b) => b.date.localeCompare(a.date));
}
