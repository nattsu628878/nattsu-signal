import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

// YouTubeのRSSもCORSヘッダーを返さないため、articleと同じくビルド時に取得する。
// フィードは最新15件までしか返さない仕様（現在12本なので足りている）。
// 新着を反映するには投稿後にdeploy workflowを手動実行する。

export type Video = {
  id: string;
  title: string;
  url: string;
  date: string; // ISO
};

const CHANNEL_ID = 'UCYShN99VWKuNvO7cboaDmHQ';

const TIMEOUT_MS = 15000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;
// ブラウザを名乗らないと素通しされないことがあるため、実在のUAを付ける。
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
// import.meta.url points into the bundled dist/ output once Vite has transpiled this file, not
// its source location, so a URL relative to it lands in the wrong place at build time. astro
// build always runs from the repo root, so resolve against that instead.
const CACHE_PATH = join(process.cwd(), 'src/data/youtube-cache.json');

/** 旧nattsu-galleryと同じく、まずmaxresを狙い、無ければhqへ落とす */
export const thumbnailUrl = (id: string) => `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
export const thumbnailFallbackUrl = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readCache(): Promise<Video[]> {
  try {
    return JSON.parse(await readFile(CACHE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

// リポジトリにコミットされたJSONを更新する。GitHub Actions上の書き込みはそのジョブの
// 使い捨てチェックアウトにしか残らない（コミットし直す権限も無い）ので、キャッシュが
// 実際に更新されるのはローカルでビルドしてコミットした時だけ——このリポジトリで既に
// 定着している「投稿後にローカルで確認してからdeployを手動実行する」運用と噛み合う。
async function writeCache(videos: Video[]) {
  try {
    await writeFile(CACHE_PATH, `${JSON.stringify(videos, null, 2)}\n`, 'utf8');
  } catch (e) {
    console.warn('[videos] キャッシュの書き込みに失敗しました:', e);
  }
}

// GitHub ActionsのランナーIPから叩くと、YouTube側のRSSが404/500を返すことがある。数回の
// 再試行では収まらないほど長引くこともあるため（実際に3回とも同じビルド内で失敗した回が
// あった）、これはあくまで一過性の揺らぎを吸収するための保険で、本当の耐障害性は
// getVideos側の「取得できなければ最後に成功した結果を使う」フォールバックが担う。
async function fetchFeed(signal: AbortSignal): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, {
        signal,
        headers: { 'user-agent': USER_AGENT },
      });
      if (res.ok) return res;
      lastError = new Error(`YouTube RSS ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    if (attempt < RETRY_ATTEMPTS) await wait(RETRY_DELAY_MS * attempt);
  }
  throw lastError;
}

export async function getVideos(): Promise<Video[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetchFeed(controller.signal);

    const parser = new XMLParser({ ignoreAttributes: true });
    const feed = parser.parse(await res.text());
    const entries = feed?.feed?.entry;
    const videos = !entries
      ? []
      : (Array.isArray(entries) ? entries : [entries])
          .map((entry: any) => {
            const id = String(entry['yt:videoId'] ?? '');
            return {
              id,
              title: String(entry.title ?? '').trim(),
              url: `https://www.youtube.com/watch?v=${id}`,
              date: new Date(entry.published).toISOString(),
            };
          })
          .filter((v) => v.id)
          .sort((a, b) => b.date.localeCompare(a.date));

    await writeCache(videos);
    return videos;
  } catch (e) {
    // 取得できなくてもビルドは通す。空にはせず、直近に成功した取得結果（コミット済みの
    // キャッシュ）を代わりに使う——GitHub Actions側の一時的な取得失敗で、サイトから
    // YouTubeの投稿が丸ごと消えるのを防ぐ。
    console.warn('[videos] YouTubeの取得に失敗しました。直近のキャッシュを代わりに使います:', e);
    return readCache();
  } finally {
    clearTimeout(timer);
  }
}
