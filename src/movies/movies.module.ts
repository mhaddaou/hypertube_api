import { Module } from '@nestjs/common';
import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';
import { YtsService } from '../yts/yts.service';
import { OmdbService } from '../omdb/omdb.service';
import { TorrentService } from '../torrent/torrent.service';
import { StreamingService } from '../streaming/streaming.service';
import { YtsProvider } from '../providers/yts.provider';
import { TmdbProvider } from '../providers/tmdb.provider';
import { JustWatchService } from '../providers/justwatch.service';

@Module({
  controllers: [MoviesController],
  providers: [
    MoviesService,
    YtsService,
    OmdbService,
    TorrentService,
    StreamingService,
    YtsProvider,
    TmdbProvider,
    JustWatchService,
  ],
})
export class MoviesModule {}
