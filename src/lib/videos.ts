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

/** 旧nattsu-galleryと同じく、まずmaxresを狙い、無ければhqへ落とす */
export const thumbnailUrl = (id: string) => `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
export const thumbnailFallbackUrl = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GitHub ActionsのランナーIPから叩くと、YouTube側のRSSが単発の404/500を返すことがある
// (同じチャンネルへ数秒後に再取得すると通ることが多い一過性のもの)。1回失敗しただけで
// このビルドのカレンダー・ギャラリーからYouTubeの投稿が丸ごと消えるのを避けるため、
// 短い間隔で数回だけ再試行してから諦める。
async function fetchFeed(signal: AbortSignal): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, { signal });
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
    if (!entries) return [];

    return (Array.isArray(entries) ? entries : [entries])
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
  } catch (e) {
    // 取得できなくてもビルドは通す（ギャラリーが空になるだけ）
    console.warn('[videos] YouTubeの取得に失敗しました:', e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
