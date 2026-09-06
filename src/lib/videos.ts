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

/** 旧nattsu-galleryと同じく、まずmaxresを狙い、無ければhqへ落とす */
export const thumbnailUrl = (id: string) => `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
export const thumbnailFallbackUrl = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

export async function getVideos(): Promise<Video[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new Error(`YouTube RSS ${res.status}`);

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
