import { Injectable } from '@nestjs/common';
import type { Torrent } from 'webtorrent';

type WebTorrentClient = {
  add: (magnetUri: string, opts: { path: string }) => Torrent;
};
type WebTorrentConstructor = new () => WebTorrentClient;

@Injectable()
export class TorrentService {
  private clientPromise: Promise<WebTorrentClient> | null = null;
  private torrents = new Map<string, Torrent>();
  private pending = new Map<string, Promise<Torrent>>();

  async getTorrent(movieId: string, magnetUri: string, storagePath: string): Promise<Torrent> {
    const existing = this.torrents.get(movieId);
    if (existing) {
      return this.waitForReady(existing);
    }

    const pending = this.pending.get(movieId);
    if (pending) {
      return pending;
    }

    const promise = this.getClient().then(
      (client) =>
        new Promise<Torrent>((resolve, reject) => {
          const torrent = client.add(magnetUri, { path: storagePath });
          this.torrents.set(movieId, torrent);
          torrent.once('ready', () => {
            this.pending.delete(movieId);
            resolve(torrent);
          });
          torrent.once('error', (error: Error) => {
            this.torrents.delete(movieId);
            this.pending.delete(movieId);
            reject(error);
          });
        }),
    );

    this.pending.set(movieId, promise);
    return promise;
  }

  getActiveTorrent(movieId: string): Torrent | null {
    return this.torrents.get(movieId) ?? null;
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
        'return import(modulePath)'
      ) as (modulePath: string) => Promise<{ default?: WebTorrentConstructor }>;

      this.clientPromise = importWebTorrent('webtorrent').then((mod) => {
        const ctor =
          (mod as { default?: WebTorrentConstructor }).default ??
          (mod as unknown as WebTorrentConstructor);
        return new ctor();
      });
    }

    return this.clientPromise;
  }
}
