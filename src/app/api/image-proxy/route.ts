import { NextResponse } from 'next/server';

export const runtime = 'edge';

function getImageCacheKey(url: string): string {
  return `img-proxy:${url}`;
}

function getRefererForUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes('doubanio.com') || hostname.includes('douban.com')) {
      return 'https://movie.douban.com/';
    }
    if (hostname.includes('mgtv.com')) {
      return 'https://www.mgtv.com/';
    }
    if (hostname.includes('iqiyi.com')) {
      return 'https://www.iqiyi.com/';
    }
    if (hostname.includes('youku.com')) {
      return 'https://www.youku.com/';
    }
    if (hostname.includes('bilivideo.com') || hostname.includes('bilibili.com')) {
      return 'https://www.bilibili.com/';
    }
    if (hostname.includes('hdslb.com')) {
      return 'https://www.bilibili.com/';
    }
    if (hostname.includes('pstatp.com') || hostname.includes('byteimg.com') || hostname.includes('bytedance.com')) {
      return 'https://www.douyin.com/';
    }
    return 'https://movie.douban.com/';
  } catch {
    return 'https://movie.douban.com/';
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
  }

  try {
    const cache = (globalThis as any).caches;
    if (cache) {
      try {
        const cacheStorage = await cache.open('image-proxy');
        const cacheKey = new Request(getImageCacheKey(imageUrl));
        const cached = await cacheStorage.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set('X-Cache', 'HIT');
          return new Response(cached.body, {
            status: 200,
            headers,
          });
        }
      } catch (e) {
        // Cache API not available, continue
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const referer = getRefererForUrl(imageUrl);
    const imageResponse = await fetch(imageUrl, {
      headers: {
        Referer: referer,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: imageResponse.statusText },
        { status: imageResponse.status }
      );
    }

    const contentType = imageResponse.headers.get('content-type');

    if (!imageResponse.body) {
      return NextResponse.json(
        { error: 'Image response has no body' },
        { status: 500 }
      );
    }

    const headers = new Headers();
    if (contentType) {
      headers.set('Content-Type', contentType);
    }

    headers.set('Cache-Control', 'public, max-age=15720000, s-maxage=15720000');
    headers.set('CDN-Cache-Control', 'public, s-maxage=15720000');
    headers.set('Vercel-CDN-Cache-Control', 'public, s-maxage=15720000');
    headers.set('X-Cache', 'MISS');

    const response = new Response(imageResponse.body, {
      status: 200,
      headers,
    });

    if (cache && contentType && contentType.startsWith('image/')) {
      try {
        const cacheStorage = await cache.open('image-proxy');
        const cacheKey = new Request(getImageCacheKey(imageUrl));
        await cacheStorage.put(cacheKey, response.clone());
      } catch (e) {
        // Cache write failed, continue
      }
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'Error fetching image' },
      { status: 500 }
    );
  }
}
