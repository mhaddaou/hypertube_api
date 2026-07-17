import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  MovieListPagination,
  MovieLanguage,
  MoviesService,
  MovieSummary,
  PopularMovieFilters,
} from './movies.service';
import { StreamingService } from '../streaming/streaming.service';
import { MovieProviderName } from '../providers/movie-provider.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UserMoviesService } from './user-movies.service';

interface JwtUser {
  userId: string;
  type: 'user' | 'client';
}

@ApiTags('movies')
@Controller('movies')
export class MoviesController {
  constructor(
    private readonly moviesService: MoviesService,
    private readonly streamingService: StreamingService,
    private readonly userMoviesService: UserMoviesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List movies' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'genre', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'language', required: false, enum: ['en', 'fr', 'ar'] })
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'fr', 'ar'] })
  @ApiQuery({ name: 'movie_language', required: false, enum: ['en', 'fr', 'ar', 'all', 'any'] })
  @ApiQuery({ name: 'original_language', required: false, enum: ['en', 'fr', 'ar', 'all', 'any'] })
  async listMovies(
    @Query('page') page: string | undefined,
    @Query('offset') offset: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('genre') genre: string | undefined,
    @Query('category') category: string | undefined,
    @Query('type') type: string | undefined,
    @Query('language') language: string | undefined,
    @Query('lang') lang: string | undefined,
    @Query('movie_language') movieLanguage: string | undefined,
    @Query('original_language') originalLanguage: string | undefined,
  ): Promise<MovieSummary[]> {
    const pagination: MovieListPagination = {
      page: parseOptionalNumber(page),
      offset: parseOptionalNumber(offset),
      limit: parseOptionalNumber(limit),
      genre: genre ?? category ?? type,
      ...buildLanguageOptions(
        language ?? lang,
        movieLanguage ?? originalLanguage,
      ),
    };
    return this.moviesService.listMovies(pagination);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search movies by name' })
  @ApiQuery({ name: 'name', required: true, type: String })
  @ApiQuery({ name: 'language', required: false, enum: ['en', 'fr', 'ar'] })
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'fr', 'ar'] })
  @ApiQuery({ name: 'movie_language', required: false, enum: ['en', 'fr', 'ar', 'all', 'any'] })
  @ApiQuery({ name: 'original_language', required: false, enum: ['en', 'fr', 'ar', 'all', 'any'] })
  async searchMovies(
    @Query('name') name: string | undefined,
    @Query('language') language: string | undefined,
    @Query('lang') lang: string | undefined,
    @Query('movie_language') movieLanguage: string | undefined,
    @Query('original_language') originalLanguage: string | undefined,
  ): Promise<MovieSummary[]> {
    const query = typeof name === 'string' ? name.trim() : '';
    if (!query) {
      throw new BadRequestException('Missing movie name');
    }
    return this.moviesService.searchMovies(
      query,
      buildLanguageOptions(language ?? lang, movieLanguage ?? originalLanguage),
    );
  }

  @Get('popular')
  @ApiOperation({ summary: 'List popular movies' })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'sort_by', required: false, type: String })
  @ApiQuery({ name: 'order_by', required: false, type: String })
  @ApiQuery({ name: 'quality', required: false, type: String })
  @ApiQuery({ name: 'minimum_rating', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'language', required: false, enum: ['en', 'fr', 'ar'] })
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'fr', 'ar'] })
  @ApiQuery({ name: 'movie_language', required: false, enum: ['en', 'fr', 'ar', 'all', 'any'] })
  @ApiQuery({ name: 'original_language', required: false, enum: ['en', 'fr', 'ar', 'all', 'any'] })
  async listPopularMovies(
    @Query('type') type: string | undefined,
    @Query('year') year: string | undefined,
    @Query('sort_by') sortBy: string | undefined,
    @Query('order_by') orderBy: string | undefined,
    @Query('quality') quality: string | undefined,
    @Query('minimum_rating') minimumRating: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('page') page: string | undefined,
    @Query('language') language: string | undefined,
    @Query('lang') lang: string | undefined,
    @Query('movie_language') movieLanguage: string | undefined,
    @Query('original_language') originalLanguage: string | undefined,
  ): Promise<MovieSummary[]> {
    const filters: PopularMovieFilters = {
      type,
      year: parseOptionalNumber(year),
      sortBy,
      orderBy,
      quality,
      minimumRating: parseOptionalNumber(minimumRating),
      limit: parseOptionalNumber(limit),
      page: parseOptionalNumber(page),
      ...buildLanguageOptions(
        language ?? lang,
        movieLanguage ?? originalLanguage,
      ),
    };
    return this.moviesService.listPopularMovies(filters);
  }

  @Get('watchlist')
  @UseGuards(JwtAuthGuard)
  listWatchlist(@CurrentUser() user: JwtUser) {
    assertUserToken(user);
    return this.userMoviesService.listWatchlist(user.userId);
  }

  @Get('wishlist')
  @UseGuards(JwtAuthGuard)
  listWishlist(@CurrentUser() user: JwtUser) {
    assertUserToken(user);
    return this.userMoviesService.listWatchlist(user.userId);
  }

  @Post(':movie_id/watchlist')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  addToWatchlist(
    @Param('movie_id') movieIdParam: string,
    @CurrentUser() user: JwtUser,
  ) {
    assertUserToken(user);
    return this.userMoviesService.addToWatchlist(
      user.userId,
      parsePositiveInt(movieIdParam, 'Invalid movie id'),
    );
  }

  @Post(':movie_id/wishlist')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  addToWishlist(
    @Param('movie_id') movieIdParam: string,
    @CurrentUser() user: JwtUser,
  ) {
    assertUserToken(user);
    return this.userMoviesService.addToWatchlist(
      user.userId,
      parsePositiveInt(movieIdParam, 'Invalid movie id'),
    );
  }

  @Delete(':movie_id/watchlist')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  removeFromWatchlist(
    @Param('movie_id') movieIdParam: string,
    @CurrentUser() user: JwtUser,
  ) {
    assertUserToken(user);
    return this.userMoviesService.removeFromWatchlist(
      user.userId,
      parsePositiveInt(movieIdParam, 'Invalid movie id'),
    );
  }

  @Delete(':movie_id/wishlist')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  removeFromWishlist(
    @Param('movie_id') movieIdParam: string,
    @CurrentUser() user: JwtUser,
  ) {
    assertUserToken(user);
    return this.userMoviesService.removeFromWatchlist(
      user.userId,
      parsePositiveInt(movieIdParam, 'Invalid movie id'),
    );
  }

  @Get('watched')
  @UseGuards(JwtAuthGuard)
  listWatched(@CurrentUser() user: JwtUser) {
    assertUserToken(user);
    return this.userMoviesService.listWatched(user.userId);
  }

  @Post(':movie_id/watched')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  markWatched(
    @Param('movie_id') movieIdParam: string,
    @CurrentUser() user: JwtUser,
  ) {
    assertUserToken(user);
    return this.userMoviesService.markWatched(
      user.userId,
      parsePositiveInt(movieIdParam, 'Invalid movie id'),
    );
  }

  @Delete(':movie_id/watched')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  unmarkWatched(
    @Param('movie_id') movieIdParam: string,
    @CurrentUser() user: JwtUser,
  ) {
    assertUserToken(user);
    return this.userMoviesService.unmarkWatched(
      user.userId,
      parsePositiveInt(movieIdParam, 'Invalid movie id'),
    );
  }

  @Get('provider/:provider/:id')
  @ApiOperation({ summary: 'Get movie details from a specific provider' })
  @ApiQuery({ name: 'language', required: false, enum: ['en', 'fr', 'ar'] })
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'fr', 'ar'] })
  async getMovieFromProvider(
    @Param('provider') provider: string,
    @Param('id') id: string,
    @Query('language') language: string | undefined,
    @Query('lang') lang: string | undefined,
  ) {
    const normalized = provider.toLowerCase();
    if (!isMovieProvider(normalized)) {
      throw new BadRequestException('Unknown provider');
    }
    return this.moviesService.getMovieDetailsFromProvider(
      normalized,
      id,
      parseOptionalLanguage(language ?? lang),
    );
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
  @ApiOperation({ summary: 'Get movie details' })
  @ApiQuery({ name: 'language', required: false, enum: ['en', 'fr', 'ar'] })
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'fr', 'ar'] })
  async getMovie(
    @Param('id') id: string,
    @Query('language') language: string | undefined,
    @Query('lang') lang: string | undefined,
  ) {
    const movieId = Number(id);
    if (!Number.isFinite(movieId)) {
      throw new BadRequestException('Invalid movie id');
    }
    return this.moviesService.getMovieDetails(
      movieId,
      parseOptionalLanguage(language ?? lang),
    );
  }

  @Get(':id/stream')
  @ApiOperation({ summary: 'Stream a movie file with byte-range support' })
  @ApiQuery({ name: 'quality', required: false, type: String })
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

    const { createReadStream, size, mimeType } =
      await this.streamingService.getStreamFile(movieId, quality);

    const range = parseRangeHeader(req.headers.range, size);
    if (!range) {
      res.status(416);
      res.set({
        'Content-Range': `bytes */${size}`,
        'Accept-Ranges': 'bytes',
      });
      res.end();
      return;
    }

    const chunkSize = range.end - range.start + 1;

    res.status(206);
    res.set({
      'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
    });
    res.flushHeaders();

    const stream = createReadStream({ start: range.start, end: range.end });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  @Get(':id/subtitles')
  @ApiOperation({ summary: 'Get subtitle file content for a movie' })
  @ApiQuery({ name: 'quality', required: false, type: String })
  @ApiQuery({ name: 'lang', required: false, type: String })
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

    const subtitle = await this.streamingService.getSubtitleText(
      movieId,
      quality,
      lang,
    );
    res.set({
      'Content-Type': subtitle.mimeType,
      'Cache-Control': 'no-store',
    });
    res.send(subtitle.content);
  }

  @Get(':id/subtitles/list')
  @ApiOperation({ summary: 'List available subtitles for a movie' })
  @ApiQuery({ name: 'quality', required: false, type: String })
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
  @ApiOperation({ summary: 'Get download/cache status for a movie' })
  @ApiQuery({ name: 'quality', required: false, type: String })
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

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildLanguageOptions(
  responseLanguageValue: string | undefined,
  movieLanguageValue: string | undefined,
): {
  responseLanguage?: MovieLanguage;
  movieLanguage?: MovieLanguage;
} {
  const responseLanguage = parseOptionalLanguage(responseLanguageValue);
  const hasMovieLanguageValue =
    typeof movieLanguageValue === 'string' && movieLanguageValue.trim();
  return {
    responseLanguage,
    movieLanguage: hasMovieLanguageValue
      ? parseOptionalMovieLanguage(movieLanguageValue)
      : responseLanguage,
  };
}

function parseOptionalLanguage(
  value: string | undefined,
): MovieLanguage | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'en' ||
    normalized === 'en-us' ||
    normalized === 'english'
  ) {
    return 'en';
  }
  if (
    normalized === 'fr' ||
    normalized === 'fr-fr' ||
    normalized === 'french'
  ) {
    return 'fr';
  }
  if (
    normalized === 'ar' ||
    normalized === 'ar-sa' ||
    normalized === 'arabic' ||
    normalized === 'العربية'
  ) {
    return 'ar';
  }

  throw new BadRequestException('Unsupported language');
}

function parseOptionalMovieLanguage(
  value: string | undefined,
): MovieLanguage | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'all' || normalized === 'any') {
    return undefined;
  }
  return parseOptionalLanguage(value);
}

function assertUserToken(user: JwtUser): void {
  if (user.type !== 'user') {
    throw new UnauthorizedException('A user access token is required');
  }
}

function parsePositiveInt(value: string, errorMessage: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(errorMessage);
  }
  return parsed;
}

interface ByteRange {
  start: number;
  end: number;
}

function parseRangeHeader(
  rangeHeader: string | undefined,
  size: number,
): ByteRange | null {
  if (size <= 0) {
    return null;
  }

  const defaultChunkSize = 1024 * 1024;
  const defaultEnd = Math.min(defaultChunkSize - 1, size - 1);
  const defaultRange = { start: 0, end: defaultEnd };
  if (!rangeHeader) {
    return defaultRange;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return defaultRange;
  }

  const startPart = match[1];
  const endPart = match[2];
  if (!startPart && !endPart) {
    return defaultRange;
  }

  if (!startPart) {
    const suffixLength = Number(endPart);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return defaultRange;
    }
    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }

  const start = Number(startPart);
  if (!Number.isSafeInteger(start) || start < 0) {
    return defaultRange;
  }
  if (start >= size) {
    return null;
  }

  if (!endPart) {
    return {
      start,
      end: Math.min(start + defaultChunkSize - 1, size - 1),
    };
  }

  const requestedEnd = Number(endPart);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) {
    return null;
  }
  const end = Math.min(requestedEnd, size - 1);
  return { start, end };
}
