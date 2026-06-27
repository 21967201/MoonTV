/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import Hls from 'hls.js';

const BUILTIN_IMAGE_PROXY = '/api/image-proxy?url=';
const BUILTIN_DOUBAN_PROXY = '/api/image-proxy?url=';

export function getImageProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const enableImageProxy = localStorage.getItem('enableImageProxy');
  if (enableImageProxy !== null) {
    if (!JSON.parse(enableImageProxy) as boolean) {
      return null;
    }
  }

  const localImageProxy = localStorage.getItem('imageProxyUrl');
  if (localImageProxy != null) {
    return localImageProxy.trim() ? localImageProxy.trim() : null;
  }

  const serverImageProxy = (window as any).RUNTIME_CONFIG?.IMAGE_PROXY;
  return serverImageProxy && serverImageProxy.trim()
    ? serverImageProxy.trim()
    : null;
}

export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  if (originalUrl.startsWith('/') || originalUrl.startsWith('data:')) {
    return originalUrl;
  }

  const proxyUrl = getImageProxyUrl();
  if (!proxyUrl) {
    return `${BUILTIN_IMAGE_PROXY}${encodeURIComponent(originalUrl)}`;
  }

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

export function getDoubanProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const enableDoubanProxy = localStorage.getItem('enableDoubanProxy');
  if (enableDoubanProxy !== null) {
    if (!JSON.parse(enableDoubanProxy) as boolean) {
      return null;
    }
  }

  const localDoubanProxy = localStorage.getItem('doubanProxyUrl');
  if (localDoubanProxy != null) {
    return localDoubanProxy.trim() ? localDoubanProxy.trim() : null;
  }

  const serverDoubanProxy = (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY;
  return serverDoubanProxy && serverDoubanProxy.trim()
    ? serverDoubanProxy.trim()
    : null;
}

export function processDoubanUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  if (originalUrl.startsWith('/') || originalUrl.startsWith('data:')) {
    return originalUrl;
  }

  const proxyUrl = getDoubanProxyUrl();
  if (!proxyUrl) {
    return `${BUILTIN_DOUBAN_PROXY}${encodeURIComponent(originalUrl)}`;
  }

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '\n')
    .replace(/\n+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^\n+|\n+$/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export async function getVideoResolutionFromM3u8(m3u8Url: string): Promise<{
  quality: string;
  loadSpeed: string;
  pingTime: number;
  codec?: string;
}> {
  try {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';

      const pingStart = performance.now();
      let pingTime = 0;

      fetch(m3u8Url, { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
          pingTime = Math.round(performance.now() - pingStart);
        })
        .catch(() => {
          pingTime = Math.round(performance.now() - pingStart);
        });

      const hls = new Hls();

      const timeout = setTimeout(() => {
        hls.destroy();
        video.remove();
        reject(new Error('Timeout loading video metadata'));
      }, 5000);

      video.onerror = () => {
        clearTimeout(timeout);
        hls.destroy();
        video.remove();
        reject(new Error('Failed to load video metadata'));
      };

      let actualLoadSpeed = '未知';
      let hasSpeedCalculated = false;
      let hasMetadataLoaded = false;
      let fragmentStartTime = 0;
      let totalFragmentSize = 0;
      let fragmentCount = 0;

      const checkAndResolve = () => {
        if (hasMetadataLoaded && (hasSpeedCalculated || actualLoadSpeed !== '未知')) {
          clearTimeout(timeout);
          const width = video.videoWidth;
          
          if (width && width > 0) {
            hls.destroy();
            video.remove();

            const quality = identifyQuality(width);
            const codec = identifyCodec(hls);

            resolve({
              quality,
              loadSpeed: actualLoadSpeed,
              pingTime: Math.round(pingTime),
              codec,
            });
          } else {
            resolve({
              quality: '未知',
              loadSpeed: actualLoadSpeed,
              pingTime: Math.round(pingTime),
            });
          }
        }
      };

      hls.on(Hls.Events.FRAG_LOADING, () => {
        fragmentStartTime = performance.now();
      });

      hls.on(Hls.Events.FRAG_LOADED, (event: any, data: any) => {
        if (fragmentStartTime > 0 && data && data.payload) {
          const loadTime = performance.now() - fragmentStartTime;
          const size = data.payload.byteLength || 0;

          if (loadTime > 0 && size > 0) {
            totalFragmentSize += size;
            fragmentCount++;

            if (fragmentCount >= 3 && !hasSpeedCalculated) {
              const totalTime = (performance.now() - fragmentStartTime) / 1000;
              const avgSpeedKBps = (totalFragmentSize / 1024) / totalTime;

              if (avgSpeedKBps >= 1024) {
                actualLoadSpeed = `${(avgSpeedKBps / 1024).toFixed(1)} MB/s`;
              } else {
                actualLoadSpeed = `${avgSpeedKBps.toFixed(1)} KB/s`;
              }
              hasSpeedCalculated = true;
              checkAndResolve();
            }
          }
        }
      });

      hls.loadSource(m3u8Url);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (event: any, data: any) => {
        console.error('HLS错误:', data);
        if (data.fatal) {
          clearTimeout(timeout);
          hls.destroy();
          video.remove();
          reject(new Error(`HLS播放失败: ${data.type}`));
        }
      });

      video.onloadedmetadata = () => {
        hasMetadataLoaded = true;
        checkAndResolve();
      };
    });
  } catch (error) {
    throw new Error(
      `Error getting video resolution: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function identifyQuality(width: number): string {
  if (width >= 3840) return '4K';
  if (width >= 2560) return '2K';
  if (width >= 1920) return '1080p';
  if (width >= 1280) return '720p';
  if (width >= 854) return '480p';
  if (width >= 640) return '360p';
  return 'SD';
}

function identifyCodec(hls: any): string | undefined {
  try {
    if (hls.media && hls.media.videoCodecs) {
      const codec = hls.media.videoCodecs;
      if (codec.includes('hev1') || codec.includes('hvc1')) return 'H.265';
      if (codec.includes('avc1')) return 'H.264';
      if (codec.includes('vp9')) return 'VP9';
    }
  } catch (e) {
    console.warn('无法识别编码格式');
  }
  return undefined;
}
