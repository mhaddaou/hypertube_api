import { Injectable, NotFoundException } from '@nestjs/common';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as mime from 'mime-types';
import type { Torrent, TorrentFile } from 'webtorrent';
import { YtsService } from '../yts/yts.service';
import { TorrentService } from '../torrent/torrent.service';
import { YtsTorrent } from '../yts/yts.types';

const TRACKERS = [
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:80',
  'udp://tracker.coppersurfer.tk:6969',
  'udp://glotorrents.pw:6969/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://torrent.gresille.org:80/announce',
  'udp://p4p.arenabg.com:1337',
  'udp://tracker.leechers-paradise.org:6969',
  'udp://p4p.arenabg.ch:1337',
  'udp://tracker.internetwarriors.net:1337',
];

interface StreamSelection {
  size: number;
  mimeType: string;
  createReadStream: (range: { start: number; end: number }) => NodeJS.ReadableStream;
}

interface SubtitleSelection {
  file: TorrentFile;
  mimeType: string;
  content: string;
}

interface SubtitleInfo {
  file: TorrentFile;
  code: string;
  label: string;
}

interface CachedMovieEntry {
  movieId: number;
  quality?: string;
  filePath: string;
  size: number;
  mimeType: string;
  completedAt: string;
}

export interface CacheStatus {
  cached: boolean;
  downloading: boolean;
  progress: number;
  downloaded: number | null;
  size: number | null;
  quality: string | null;
  completedAt: string | null;
}

@Injectable()
export class StreamingService {
  private storagePath = path.join(process.cwd(), 'storage');
  private cacheIndexPath = path.join(this.storagePath, 'cache-index.json');
  private cacheIndexLoaded = false;
  private cacheIndex = new Map<string, CachedMovieEntry>();
  private cacheTracking = new Set<string>();

  constructor(
    private readonly ytsService: YtsService,
    private readonly torrentService: TorrentService,
  ) {}

  async getStreamFile(movieId: number, quality?: string): Promise<StreamSelection> {
    await fs.mkdir(this.storagePath, { recursive: true });
    await this.ensureCacheIndexLoaded();

    const cached = await this.getCachedStream(movieId, quality);
    if (cached) {
      return cached;
    }

    const movie = await this.ytsService.getMovieDetails(movieId);
    const torrentInfo = pickTorrent(movie.torrents ?? [], quality);
    if (!torrentInfo) {
      throw new NotFoundException('No torrent available for movie');
    }

    const magnetUri = buildMagnet(torrentInfo.hash, movie.title);
    const torrent = await this.torrentService.getTorrent(
      String(movieId),
      magnetUri,
      this.storagePath,
    );

    const file = pickVideoFile(torrent.files);
    if (!file) {
      throw new NotFoundException('No video file found in torrent');
    }

    file.select();
    const mimeType = mime.lookup(file.name) || 'application/octet-stream';

    this.trackFileDownload(torrent, file, movieId, torrentInfo.quality, mimeType);

    return {
      size: file.length,
      mimeType,
      createReadStream: (range) => file.createReadStream(range),
    };
  }

  async getSubtitleText(
    movieId: number,
    quality?: string,
    lang?: string,
  ): Promise<SubtitleSelection> {
    await fs.mkdir(this.storagePath, { recursive: true });

    const movie = await this.ytsService.getMovieDetails(movieId);
    const torrentInfo = pickTorrent(movie.torrents ?? [], quality);
    if (!torrentInfo) {
      throw new NotFoundException('No torrent available for movie');
    }

    const magnetUri = buildMagnet(torrentInfo.hash, movie.title);
    const torrent = await this.torrentService.getTorrent(
      String(movieId),
      magnetUri,
      this.storagePath,
    );

    const subtitles = listSubtitleFiles(torrent.files);
    const subtitleInfo = pickSubtitleFile(subtitles, lang);
    if (!subtitleInfo) {
      throw new NotFoundException('No subtitle file found');
    }

    subtitleInfo.file.select();
    const buffer = await getTorrentFileBuffer(subtitleInfo.file);
    const rawText = buffer.toString('utf-8');
    const ext = path.extname(subtitleInfo.file.name).toLowerCase();

    if (ext === '.vtt') {
      return {
        file: subtitleInfo.file,
        mimeType: 'text/vtt; charset=utf-8',
        content: ensureVttHeader(rawText),
      };
    }

    return {
      file: subtitleInfo.file,
      mimeType: 'text/vtt; charset=utf-8',
      content: srtToVtt(rawText),
    };
  }

  async listSubtitles(
    movieId: number,
    quality?: string,
  ): Promise<Array<{ code: string; label: string }>> {
    await fs.mkdir(this.storagePath, { recursive: true });

    const movie = await this.ytsService.getMovieDetails(movieId);
    const torrentInfo = pickTorrent(movie.torrents ?? [], quality);
    if (!torrentInfo) {
      throw new NotFoundException('No torrent available for movie');
    }

    const magnetUri = buildMagnet(torrentInfo.hash, movie.title);
    const torrent = await this.torrentService.getTorrent(
      String(movieId),
      magnetUri,
      this.storagePath,
    );

    const subtitles = listSubtitleFiles(torrent.files);
    const deduped = new Map<string, SubtitleInfo>();
    subtitles.forEach((subtitle) => {
      const key = `${subtitle.code}:${subtitle.label}`;
      if (!deduped.has(key)) {
        deduped.set(key, subtitle);
      }
    });

    return Array.from(deduped.values()).map((subtitle) => ({
      code: subtitle.code,
      label: subtitle.label,
    }));
  }

  async getCacheStatus(movieId: number, quality?: string): Promise<CacheStatus> {
    await fs.mkdir(this.storagePath, { recursive: true });
    await this.ensureCacheIndexLoaded();

    const cached = await this.resolveCachedEntry(movieId, quality);
    if (cached) {
      return {
        cached: true,
        downloading: false,
        progress: 1,
        downloaded: cached.stat.size,
        size: cached.stat.size,
        quality: cached.entry.quality ?? null,
        completedAt: cached.entry.completedAt,
      };
    }

    const torrent = this.torrentService.getActiveTorrent(String(movieId));
    if (!torrent) {
      return {
        cached: false,
        downloading: false,
        progress: 0,
        downloaded: null,
        size: null,
        quality: null,
        completedAt: null,
      };
    }

    const status = readTorrentStatus(torrent);
    return {
      cached: false,
      downloading: true,
      progress: status.progress,
      downloaded: status.downloaded,
      size: status.size,
      quality: null,
      completedAt: null,
    };
  }

  private async ensureCacheIndexLoaded(): Promise<void> {
    if (this.cacheIndexLoaded) {
      return;
    }

    try {
      const raw = await fs.readFile(this.cacheIndexPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, CachedMovieEntry>;
      this.cacheIndex = new Map(Object.entries(parsed));
    } catch (error) {
      this.cacheIndex = new Map();
    } finally {
      this.cacheIndexLoaded = true;
    }
  }

  private async persistCacheIndex(): Promise<void> {
    const payload: Record<string, CachedMovieEntry> = {};
    for (const [key, entry] of this.cacheIndex.entries()) {
      payload[key] = entry;
    }
    await fs.writeFile(this.cacheIndexPath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  private cacheKey(movieId: number, quality?: string): string {
    return `${movieId}:${quality ?? 'auto'}`;
  }

  private pickCacheEntry(
    movieId: number,
    quality?: string,
  ): { key: string; entry: CachedMovieEntry } | null {
    if (quality) {
      const key = this.cacheKey(movieId, quality);
      const entry = this.cacheIndex.get(key);
      return entry ? { key, entry } : null;
    }

    const preferred = this.cacheKey(movieId, '720p');
    const preferredEntry = this.cacheIndex.get(preferred);
    if (preferredEntry) {
      return { key: preferred, entry: preferredEntry };
    }

    const prefix = `${movieId}:`;
    for (const [key, entry] of this.cacheIndex.entries()) {
      if (key.startsWith(prefix)) {
        return { key, entry };
      }
    }

    return null;
  }

  private async getCachedStream(
    movieId: number,
    quality?: string,
  ): Promise<StreamSelection | null> {
    const cached = await this.resolveCachedEntry(movieId, quality);
    if (!cached) {
      return null;
    }

    const mimeType =
      cached.entry.mimeType ||
      mime.lookup(cached.entry.filePath) ||
      'application/octet-stream';
    return {
      size: cached.stat.size,
      mimeType,
      createReadStream: (range) => fsSync.createReadStream(cached.entry.filePath, range),
    };
  }

  private async resolveCachedEntry(
    movieId: number,
    quality?: string,
  ): Promise<{ key: string; entry: CachedMovieEntry; stat: fsSync.Stats } | null> {
    const result = this.pickCacheEntry(movieId, quality);
    if (!result) {
      return null;
    }

    const { key, entry } = result;
    try {
      const stat = await fs.stat(entry.filePath);
      if (!stat.isFile()) {
        this.cacheIndex.delete(key);
        await this.persistCacheIndex();
        return null;
      }
      return { key, entry, stat };
    } catch (error) {
      this.cacheIndex.delete(key);
      await this.persistCacheIndex();
      return null;
    }
  }

  private trackFileDownload(
    torrent: Torrent,
    file: TorrentFile,
    movieId: number,
    quality: string | undefined,
    mimeType: string,
  ): void {
    const cacheQuality = quality || 'unknown';
    const key = this.cacheKey(movieId, cacheQuality);
    if (this.cacheTracking.has(key)) {
      return;
    }
    this.cacheTracking.add(key);

    const torrentPath = (torrent as unknown as { path?: string }).path || this.storagePath;
    const relativePath = (file as unknown as { path?: string }).path || file.name;
    const fullPath = path.join(torrentPath, relativePath);

    const saveEntry = async () => {
      try {
        const entry: CachedMovieEntry = {
          movieId,
          quality: cacheQuality,
          filePath: fullPath,
          size: file.length,
          mimeType,
          completedAt: new Date().toISOString(),
        };
        this.cacheIndex.set(key, entry);
        await this.persistCacheIndex();
      } catch (error) {
        console.error(`Failed to save cache entry for movie ${movieId}:`, error);
      }
    };

    const checkCompletion = () => {
      if (isTorrentFileComplete(file) || (torrent as unknown as { done?: boolean }).done) {
        torrent.removeListener('download', checkCompletion);
        torrent.removeListener('done', checkCompletion);
        void saveEntry();
      }
    };

    // Check immediately in case it's already complete
    checkCompletion();
    
    // Also listen for future events
    torrent.on('download', checkCompletion);
    torrent.on('done', checkCompletion);
  }
}

function isTorrentFileComplete(file: TorrentFile): boolean {
  const info = file as unknown as {
    downloaded?: number;
    length?: number;
    progress?: number;
  };
  
  // Check progress first (most reliable)
  if (typeof info.progress === 'number') {
    return info.progress >= 0.99999; // Use 99.999% to account for floating point precision
  }
  
  // Check downloaded vs length
  if (typeof info.downloaded === 'number' && typeof info.length === 'number') {
    return info.downloaded >= info.length * 0.99999;
  }
  
  return false;
}

function pickTorrent(torrents: YtsTorrent[], quality?: string): YtsTorrent | null {
  if (!torrents.length) {
    return null;
  }

  const normalizedQuality = quality?.toLowerCase();
  const qualityMatch = normalizedQuality
    ? torrents.find((torrent) => torrent.quality.toLowerCase() === normalizedQuality)
    : null;
  const preferred720p = torrents.find((torrent) => torrent.quality === '720p');
  const bySeeds = [...torrents].sort((a, b) => (b.seeds || 0) - (a.seeds || 0))[0];

  return qualityMatch ?? preferred720p ?? bySeeds ?? null;
}

function buildMagnet(hash: string, title: string): string {
  const trackerQuery = TRACKERS.map((tracker) => `tr=${encodeURIComponent(tracker)}`).join('&');
  const name = encodeURIComponent(title);
  return `magnet:?xt=urn:btih:${hash}&dn=${name}&${trackerQuery}`;
}

function pickVideoFile(files: TorrentFile[]): TorrentFile | null {
  if (!files.length) {
    return null;
  }

  const videoExtensions = new Set(['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi', '.wmv']);
  const videoFiles = files.filter((file) =>
    videoExtensions.has(path.extname(file.name).toLowerCase()),
  );
  const candidates = videoFiles.length ? videoFiles : files;
  if (!videoFiles.length) {
    return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
  }

  const preferredOrder = ['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi', '.wmv'];
  for (const ext of preferredOrder) {
    const matches = videoFiles.filter(
      (file) => path.extname(file.name).toLowerCase() === ext,
    );
    if (matches.length) {
      return matches.sort((a, b) => b.length - a.length)[0] ?? null;
    }
  }

  return videoFiles.sort((a, b) => b.length - a.length)[0] ?? null;
}

function listSubtitleFiles(files: TorrentFile[]): SubtitleInfo[] {
  const subtitleExtensions = new Set(['.vtt', '.srt']);
  return files
    .filter((file) => subtitleExtensions.has(path.extname(file.name).toLowerCase()))
    .map((file) => ({
      file,
      ...parseSubtitleMeta(file.name),
    }));
}

function pickSubtitleFile(subtitles: SubtitleInfo[], lang?: string): SubtitleInfo | null {
  if (!subtitles.length) {
    return null;
  }

  if (!lang) {
    return subtitles[0];
  }

  const tokens = normalizeLanguageTokens(lang);
  const matches = subtitles.filter((subtitle) => {
    const label = subtitle.label.toLowerCase();
    return (
      tokens.includes(subtitle.code) ||
      tokens.some((token) => token.length > 2 && label.includes(token))
    );
  });

  return matches[0] ?? subtitles[0];
}

function parseSubtitleMeta(fileName: string): { code: string; label: string } {
  const base = path.basename(fileName);
  const match = /^(.*)\.([a-z]{2,3})\.(srt|vtt)$/i.exec(base);
  if (match) {
    return {
      label: match[1].replace(/[._]+/g, ' ').trim(),
      code: match[2].toLowerCase(),
    };
  }

  const label = base.replace(/\.(srt|vtt)$/i, '').replace(/[._]+/g, ' ').trim();
  return {
    label,
    code: 'und',
  };
}

function normalizeLanguageTokens(lang?: string): string[] {
  if (!lang) {
    return [];
  }

  const normalized = lang.toLowerCase();
  if (normalized === 'en' || normalized === 'eng' || normalized === 'english') {
    return ['eng', 'en', 'english'];
  }
  if (normalized === 'fr' || normalized === 'fre' || normalized === 'french') {
    return ['fre', 'fr', 'french'];
  }
  if (normalized === 'es' || normalized === 'spa' || normalized === 'spanish') {
    return ['spa', 'es', 'spanish'];
  }
  if (normalized === 'de' || normalized === 'ger' || normalized === 'german') {
    return ['ger', 'de', 'german'];
  }
  if (normalized === 'it' || normalized === 'ita' || normalized === 'italian') {
    return ['ita', 'it', 'italian'];
  }
  if (normalized === 'pt' || normalized === 'por' || normalized === 'portuguese') {
    return ['por', 'pt', 'portuguese'];
  }
  if (normalized === 'nl' || normalized === 'dut' || normalized === 'dutch') {
    return ['dut', 'nl', 'dutch'];
  }
  if (normalized === 'sv' || normalized === 'swe' || normalized === 'swedish') {
    return ['swe', 'sv', 'swedish'];
  }
  if (normalized === 'no' || normalized === 'nor' || normalized === 'norwegian') {
    return ['nor', 'no', 'norwegian'];
  }
  if (normalized === 'da' || normalized === 'dan' || normalized === 'danish') {
    return ['dan', 'da', 'danish'];
  }
  if (normalized === 'fi' || normalized === 'fin' || normalized === 'finnish') {
    return ['fin', 'fi', 'finnish'];
  }
  if (normalized === 'pl' || normalized === 'pol' || normalized === 'polish') {
    return ['pol', 'pl', 'polish'];
  }
  return [normalized];
}

function srtToVtt(text: string): string {
  const cleaned = text.replace(/\ufeff/g, '').replace(/\r/g, '');
  const converted = cleaned.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2',
  );
  return `WEBVTT\n\n${converted}`;
}

function ensureVttHeader(text: string): string {
  const cleaned = text.replace(/\ufeff/g, '').replace(/\r/g, '');
  if (cleaned.startsWith('WEBVTT')) {
    return cleaned;
  }
  return `WEBVTT\n\n${cleaned}`;
}

function getTorrentFileBuffer(file: TorrentFile): Promise<Buffer> {
  const getter = (file as unknown as {
    getBuffer?: (cb: (error: Error | null, buffer: Buffer) => void) => void;
  }).getBuffer;

  if (getter) {
    return new Promise<Buffer>((resolve, reject) => {
      getter.call(file, (error, buffer) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(buffer);
      });
    });
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = file.createReadStream();
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function readTorrentStatus(
  torrent: Torrent,
): { progress: number; downloaded: number | null; size: number | null } {
  const torrentInfo = torrent as unknown as {
    progress?: number;
    downloaded?: number;
    length?: number;
    done?: boolean;
    files?: Array<{ length?: number; downloaded?: number }>;
  };

  // Calculate total size and downloaded from all files
  let totalSize = 0;
  let totalDownloaded = 0;

  if (Array.isArray(torrentInfo.files)) {
    for (const file of torrentInfo.files) {
      const fileInfo = file as unknown as { length?: number; downloaded?: number };
      if (typeof fileInfo.length === 'number') {
        totalSize += fileInfo.length;
      }
      if (typeof fileInfo.downloaded === 'number') {
        totalDownloaded += fileInfo.downloaded;
      }
    }
  }

  const size = totalSize > 0 ? totalSize : (Number.isFinite(torrentInfo.length) ? (torrentInfo.length as number) : null);
  const downloaded = totalDownloaded > 0 ? totalDownloaded : (Number.isFinite(torrentInfo.downloaded) ? (torrentInfo.downloaded as number) : null);
  let progress = Number.isFinite(torrentInfo.progress) ? (torrentInfo.progress as number) ?? 0 : 0;

  if (torrentInfo.done) {
    progress = 1;
  } else if (!Number.isFinite(progress) || progress <= 0) {
    if (typeof size === 'number' && size > 0 && typeof downloaded === 'number') {
      progress = downloaded / size;
    } else {
      progress = 0;
    }
  }

  if (progress < 0) {
    progress = 0;
  }
  if (progress > 1) {
    progress = 1;
  }

  return {
    progress,
    downloaded: typeof downloaded === 'number' && downloaded > 0 ? downloaded : null,
    size: typeof size === 'number' && size > 0 ? size : null,
  };
}
