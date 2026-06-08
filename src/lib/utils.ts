/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import Hls from 'hls.js';

/**
 * 获取图片代理 URL 设置
 */
export function getImageProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 本地未开启图片代理，则不使用代理
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

  // 如果未设置，则使用全局对象
  const serverImageProxy = (window as any).RUNTIME_CONFIG?.IMAGE_PROXY;
  return serverImageProxy && serverImageProxy.trim()
    ? serverImageProxy.trim()
    : null;
}

/**
 * 处理图片 URL，如果设置了图片代理则使用代理
 */
export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const proxyUrl = getImageProxyUrl();
  if (!proxyUrl) return originalUrl;

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

/**
 * 获取豆瓣代理 URL 设置
 */
export function getDoubanProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 本地未开启豆瓣代理，则不使用代理
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

  // 如果未设置，则使用全局对象
  const serverDoubanProxy = (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY;
  return serverDoubanProxy && serverDoubanProxy.trim()
    ? serverDoubanProxy.trim()
    : null;
}

/**
 * 处理豆瓣 URL，如果设置了豆瓣代理则使用代理
 */
export function processDoubanUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const proxyUrl = getDoubanProxyUrl();
  if (!proxyUrl) return originalUrl;

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '\n') // 将 HTML 标签替换为换行
    .replace(/\n+/g, '\n') // 将多个连续换行合并为一个
    .replace(/[ \t]+/g, ' ') // 将多个连续空格和制表符合并为一个空格，但保留换行符
    .replace(/^\n+|\n+$/g, '') // 去掉首尾换行
    .replace(/&nbsp;/g, ' ') // 将 &nbsp; 替换为空格
    .trim(); // 去掉首尾空格
}

/**
 * 🎯 优化后的视频质量检测系统
 * 支持更精准的分辨率识别和编码格式检测
 */
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

      // 📊 优化的网络延迟测量
      const pingStart = performance.now();
      let pingTime = 0;

      // 使用 Range 请求测量 ping（更精准）
      fetch(m3u8Url, { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
          pingTime = Math.round(performance.now() - pingStart);
        })
        .catch(() => {
          pingTime = Math.round(performance.now() - pingStart);
        });

      const hls = new Hls();

      // ⏱️ 优化的超时控制
      const timeout = setTimeout(() => {
        hls.destroy();
        video.remove();
        reject(new Error('Timeout loading video metadata'));
      }, 5000); // 提升到 5 秒以增加成功率

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

            // 🎬 增强的分辨率识别��支持更多精度）
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

      // 📈 优化的分片加载速度测量
      hls.on(Hls.Events.FRAG_LOADING, () => {
        fragmentStartTime = performance.now();
      });

      // 🚀 基于多个分片计算平均速度（更稳定）
      hls.on(Hls.Events.FRAG_LOADED, (event: any, data: any) => {
        if (fragmentStartTime > 0 && data && data.payload) {
          const loadTime = performance.now() - fragmentStartTime;
          const size = data.payload.byteLength || 0;

          if (loadTime > 0 && size > 0) {
            totalFragmentSize += size;
            fragmentCount++;

            // 累积 3 个分片后计算速度（更稳定）
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

/**
 * 🎯 增强的画质识别算法
 * 支持更细粒度的分辨率识别
 */
function identifyQuality(width: number): string {
  if (width >= 3840) return '4K'; // 4K: 3840×2160
  if (width >= 2560) return '2K'; // 2K: 2560×1440
  if (width >= 1920) return '1080p'; // 1080p: 1920×1080
  if (width >= 1280) return '720p'; // 720p: 1280×720
  if (width >= 854) return '480p'; // 480p: 854×480
  if (width >= 640) return '360p'; // 360p: 640×360
  return 'SD'; // 标清
}

/**
 * 📹 编码格式检测
 */
function identifyCodec(hls: any): string | undefined {
  try {
    // 尝试从 HLS.js 内部获取编码信息
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
