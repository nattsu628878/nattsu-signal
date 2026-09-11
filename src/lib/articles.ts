import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// astro buildは常にリポジトリルートから走るので、これで src/data/ を指せる
// (import.meta.urlはビルド後のdist/内へ束ねられるため使えない — videos.tsと同じ理由)。
function cachePath(name: 'note' | 'qiita') {
  return join(process.cwd(), `src/data/${name}-cache.json`);
}

async function readCache(name: 'note' | 'qiita'): Promise<Article[]> {
  try {
    return JSON.parse(await readFile(cachePath(name), 'utf8'));
  } catch {
    return [];
  }
}

async function writeCache(name: 'note' | 'qiita', articles: Article[]) {
  try {
    await writeFile(cachePath(name), `${JSON.stringify(articles, null, 2)}\n`, 'utf8');
  } catch (e) {
    console.warn(`[articles] ${name}キャッシュの書き込みに失敗しました:`, e);
  }
}

// GitHub ActionsのランナーIPから叩くと、note/Qiita側が単発の5xxを返すことがある
// (videos.tsのYouTube RSSで実際に起きた: 500→404と続けて失敗し、その回のビルドだけ
// 投稿が丸ごと消えた)。4xxは再試行しても変わらないため(Qiitaの404=アカウント未作成
// はfetchQiita側で意図的に処理する)即座に返し、5xxとネットワークエラーだけ一過性と
// みなして数回だけ再試行する。
async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let lastError: unknown;
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        if (res.ok || res.status < 500) return res;
        lastError = new Error(`${url} ${res.status}`);
      } catch (e) {
        lastError = e;
      }
      if (attempt < RETRY_ATTEMPTS) await wait(RETRY_DELAY_MS * attempt);
    }
    throw lastError;
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

  const articles = (Array.isArray(items) ? items : [items]).map((item: any) => ({
    title: String(item.title ?? '').trim(),
    url: String(item.link ?? ''),
    date: new Date(item.pubDate).toISOString(),
    source: 'note' as const,
  }));
  await writeCache('note', articles);
  return articles;
}

async function fetchQiita(): Promise<Article[]> {
  // 認証なしで公開記事を読める（未認証は60req/hだが、ビルド時に1回だけなので十分）
  const res = await fetchWithTimeout(
    `https://qiita.com/api/v2/users/${QIITA_USER}/items?per_page=20`
  );
  if (res.status === 404) return []; // アカウント未作成のうちは空で通す
  if (!res.ok) throw new Error(`Qiita API ${res.status}`);

  const items: any[] = await res.json();
  const articles = items
    .filter((item) => !item.private)
    .map((item) => ({
      title: String(item.title ?? '').trim(),
      url: String(item.url ?? ''),
      date: new Date(item.created_at).toISOString(),
      source: 'Qiita' as const,
    }));
  await writeCache('qiita', articles);
  return articles;
}

/**
 * note・Qiitaの投稿を1つの新しい順リストにまとめる。
 * 片方が落ちてもビルド全体は止めず、取れた分だけ返す。取得自体に失敗したソースは、
 * 空にはせず直近に成功した取得結果（コミット済みのキャッシュ）を代わりに使う。
 */
export async function getArticles(): Promise<Article[]> {
  const [note, qiita] = await Promise.allSettled([fetchNote(), fetchQiita()]);

  const articles: Article[] = [];
  for (const [name, result] of [['note', note], ['qiita', qiita]] as const) {
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    } else {
      console.warn(`[articles] ${name}の取得に失敗しました。直近のキャッシュを代わりに使います:`, result.reason);
      articles.push(...(await readCache(name)));
    }
  }

  return articles.sort((a, b) => b.date.localeCompare(a.date));
}
