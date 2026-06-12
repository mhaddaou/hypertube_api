import { BadRequestException, Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { MoviesService, MovieSummary } from './movies.service';
import { StreamingService } from '../streaming/streaming.service';
import { MovieProviderName } from '../providers/movie-provider.types';

@Controller('movies')
export class MoviesController {
  constructor(
    private readonly moviesService: MoviesService,
    private readonly streamingService: StreamingService,
  ) {}

  @Get()
  async listMovies(): Promise<MovieSummary[]> {
    return this.moviesService.listMovies();
  }

  @Get('search')
  async searchMovies(@Query('name') name: string | undefined): Promise<MovieSummary[]> {
    const query = typeof name === 'string' ? name.trim() : '';
    if (!query) {
      throw new BadRequestException('Missing movie name');
    }
    return this.moviesService.searchMovies(query);
  }

  @Get('provider/:provider/:id')
  async getMovieFromProvider(
    @Param('provider') provider: string,
    @Param('id') id: string,
  ) {
    const normalized = provider.toLowerCase();
    if (!isMovieProvider(normalized)) {
      throw new BadRequestException('Unknown provider');
    }
    return this.moviesService.getMovieDetailsFromProvider(normalized, id);
  }

  @Get('provider/:provider/:id/resolve')
  async resolveProviderToYts(
    @Param('provider') provider: string,
    @Param('id') id: string,
  ) {
    const normalized = provider.toLowerCase();
    if (normalized !== 'tmdb') {
      throw new BadRequestException('Unsupported provider for resolution');
    }

    const ytsId = await this.moviesService.resolveTmdbToYtsId(id);
    return { yts_id: ytsId };
  }

  @Get(':id')
  async getMovie(@Param('id') id: string) {
    const movieId = Number(id);
    if (!Number.isFinite(movieId)) {
      throw new BadRequestException('Invalid movie id');
    }
    return this.moviesService.getMovieDetails(movieId);
  }

  @Get(':id/stream')
  async streamMovie(
    @Param('id') id: string,
    @Query('quality') quality: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const movieId = Number(id);
    if (!Number.isFinite(movieId)) {
      throw new BadRequestException('Invalid movie id');
    }

    const { createReadStream, size, mimeType } = await this.streamingService.getStreamFile(
      movieId,
      quality,
    );

    const range = parseRangeHeader(req.headers.range, size);
    const chunkSize = range.end - range.start + 1;

    res.status(206);
    res.set({
      'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
    });

    const stream = createReadStream({ start: range.start, end: range.end });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  @Get(':id/subtitles')
  async getSubtitles(
    @Param('id') id: string,
    @Query('quality') quality: string | undefined,
    @Query('lang') lang: string | undefined,
    @Res() res: Response,
  ) {
    const movieId = Number(id);
    if (!Number.isFinite(movieId)) {
      throw new BadRequestException('Invalid movie id');
    }

    const subtitle = await this.streamingService.getSubtitleText(movieId, quality, lang);
    res.set({
      'Content-Type': subtitle.mimeType,
      'Cache-Control': 'no-store',
    });
    res.send(subtitle.content);
  }

  @Get(':id/subtitles/list')
  async listSubtitles(
    @Param('id') id: string,
    @Query('quality') quality: string | undefined,
  ) {
    const movieId = Number(id);
    if (!Number.isFinite(movieId)) {
      throw new BadRequestException('Invalid movie id');
    }

    return this.streamingService.listSubtitles(movieId, quality);
  }

  @Get(':id/cache')
  async getCacheStatus(
    @Param('id') id: string,
    @Query('quality') quality: string | undefined,
  ) {
    const movieId = Number(id);
    if (!Number.isFinite(movieId)) {
      throw new BadRequestException('Invalid movie id');
    }

    return this.streamingService.getCacheStatus(movieId, quality);
  }
}

function isMovieProvider(value: string): value is MovieProviderName {
  return value === 'yts' || value === 'tmdb';
}

interface ByteRange {
  start: number;
  end: number;
}

function parseRangeHeader(rangeHeader: string | undefined, size: number): ByteRange {
  if (size <= 0) {
    return { start: 0, end: 0 };
  }

  const defaultChunkSize = 1024 * 1024;
  const defaultEnd = Math.min(defaultChunkSize - 1, size - 1);
  if (!rangeHeader) {
    return { start: 0, end: defaultEnd };
  }

  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  if (!match) {
    return { start: 0, end: defaultEnd };
  }

  const startValue = match[1] ? Number(match[1]) : Number.NaN;
  const endValue = match[2] ? Number(match[2]) : Number.NaN;

  let start = Number.isFinite(startValue) && startValue >= 0 ? startValue : 0;
  let end = Number.isFinite(endValue)
    ? endValue
    : Math.min(start + defaultChunkSize - 1, size - 1);

  if (start >= size) {
    start = 0;
    end = defaultEnd;
  }

  if (end >= size) {
    end = size - 1;
  }

  if (end < start) {
    end = Math.min(start + defaultChunkSize - 1, size - 1);
  }

  return { start, end };
}
