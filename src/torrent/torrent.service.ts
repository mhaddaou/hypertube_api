import { Injectable } from '@nestjs/common';
import type { Torrent } from 'webtorrent';

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

const DEFAULT_WEBTORRENT_TORRENT_PORT = 51413;
const DEFAULT_WEBTORRENT_DHT_PORT = 51414;

interface WebTorrentAddOptions {
  path: string;
  announce?: string[];
}

interface WebTorrentClientOptions {
  torrentPort?: number;
  dhtPort?: number;
  tracker?: { announce?: string[] };
}

type WebTorrentClient = {
  add: (torrentId: string, opts: WebTorrentAddOptions) => Torrent;
};
type WebTorrentConstructor = new (options?: WebTorrentClientOptions) => WebTorrentClient;

function buildWebTorrentClientOptions(): WebTorrentClientOptions {
  const torrentPort = parsePort(
    process.env.WEBTORRENT_TORRENT_PORT,
    DEFAULT_WEBTORRENT_TORRENT_PORT,
  );
  const dhtPort = parsePort(
    process.env.WEBTORRENT_DHT_PORT,
    DEFAULT_WEBTORRENT_DHT_PORT,
  );

  return {
    torrentPort,
    dhtPort,
    tracker: { announce: TRACKERS },
  };
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }

  return parsed;
}

@Injectable()
export class TorrentService {
  private clientPromise: Promise<WebTorrentClient> | null = null;
  private torrents = new Map<string, Torrent>();
  private pending = new Map<string, Promise<Torrent>>();

  async getTorrent(
    torrentKey: string,
    torrentId: string,
    storagePath: string,
  ): Promise<Torrent> {
    const existing = this.torrents.get(torrentKey);
    if (existing) {
      return this.waitForReady(existing);
    }

    const pending = this.pending.get(torrentKey);
    if (pending) {
      return pending;
    }

    const promise = this.getClient().then(
      (client) =>
        new Promise<Torrent>((resolve, reject) => {
          const torrent = client.add(torrentId, {
            path: storagePath,
            announce: TRACKERS,
          });
          this.torrents.set(torrentKey, torrent);
          torrent.once('ready', () => {
            this.pending.delete(torrentKey);
            resolve(torrent);
          });
          torrent.once('error', (error: Error) => {
            this.torrents.delete(torrentKey);
            this.pending.delete(torrentKey);
            reject(error);
          });
        }),
    );

    this.pending.set(torrentKey, promise);
    return promise;
  }

  getActiveTorrent(torrentKeyOrMovieId: string): Torrent | null {
    const exact = this.torrents.get(torrentKeyOrMovieId);
    if (exact) {
      return exact;
    }

    const moviePrefix = `${torrentKeyOrMovieId}:`;
    for (const [torrentKey, torrent] of this.torrents.entries()) {
      if (torrentKey.startsWith(moviePrefix)) {
        return torrent;
      }
    }

    return null;
  }

  getReadyTorrent(movieId: string): Torrent | null {
    const torrent = this.getActiveTorrent(movieId);
    if (!torrent) {
      return null;
    }
    return (torrent as unknown as { ready?: boolean }).ready ? torrent : null;
  }

  private waitForReady(torrent: Torrent): Promise<Torrent> {
    if ((torrent as unknown as { ready?: boolean }).ready) {
      return Promise.resolve(torrent);
    }

    return new Promise((resolve, reject) => {
      torrent.once('ready', () => resolve(torrent));
      torrent.once('error', (error: Error) => reject(error));
    });
  }

  private async getClient(): Promise<WebTorrentClient> {
    if (!this.clientPromise) {
      const importWebTorrent = new Function(
        'modulePath',
        'return import(modulePath)',
      ) as (modulePath: string) => Promise<{ default?: WebTorrentConstructor }>;

      this.clientPromise = importWebTorrent('webtorrent').then((mod) => {
        const ctor =
          (mod as { default?: WebTorrentConstructor }).default ??
          (mod as unknown as WebTorrentConstructor);
        return new ctor(buildWebTorrentClientOptions());
      });
    }

    return this.clientPromise;
  }
}
