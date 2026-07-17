import { Injectable, NotFoundException } from '@nestjs/common';
import { OmdbService } from '../omdb/omdb.service';
import { YtsService } from '../yts/yts.service';
import { JustWatchService } from '../providers/justwatch.service';
import {
  MovieProviderName,
  MovieSearchResult,
} from '../providers/movie-provider.types';
import { TmdbProvider } from '../providers/tmdb.provider';
import { YtsProvider } from '../providers/yts.provider';
import { StreamingService } from '../streaming/streaming.service';
import { YtsMovieSummary, YtsTorrent } from '../yts/yts.types';
import {
  YtsListMoviesOptions,
  YtsOrderBy,
  YtsSortBy,
} from '../yts/yts.service';

@Injectable()
export class MoviesService {
  constructor(
    private readonly ytsService: YtsService,
    private readonly omdbService: OmdbService,
    private readonly ytsProvider: YtsProvider,
    private readonly tmdbProvider: TmdbProvider,
    private readonly justWatchService: JustWatchService,
    private readonly streamingService: StreamingService,
  ) {}

  async listMovies(pagination: MovieListPagination = {}) {
    const movies = await this.fetchPaginatedMovies(pagination);
    const summaries = await Promise.all(
      movies.map((movie) =>
        this.buildYtsSummary(movie, pagination.responseLanguage),
      ),
    );
    return Promise.all(
      summaries.map((summary) => this.attachCacheStatus(summary)),
    );
  }

  async listPopularMovies(filters: PopularMovieFilters) {
    const limit = clampNumber(filters.limit, 1, 50, 12);
    const page = clampNumber(filters.page, 1, 1000, 1);
    const year = normalizeYear(filters.year);
    const ytsLimit = year ? 50 : limit;

    const ytsOptions = {
      quality: filters.quality,
      minimumRating: normalizeMinimumRating(filters.minimumRating),
      genre: normalizeGenre(filters.type),
      sortBy: mapPopularSort(filters.sortBy),
      orderBy: normalizeOrder(filters.orderBy),
    };
    const movies =
      year || filters.movieLanguage
        ? await this.fetchFilteredYtsMovies({
            limit,
            offset: (page - 1) * limit,
            language: filters.movieLanguage,
            year,
            ytsOptions,
          })
        : await this.ytsService.listMovies({
            ...ytsOptions,
            limit: ytsLimit,
            page,
          });

    const filtered =
      year && !filters.movieLanguage
        ? movies.filter((movie) => movie.year === year).slice(0, limit)
        : movies;
    const summaries = await Promise.all(
      filtered.map((movie) =>
        this.buildYtsSummary(movie, filters.responseLanguage),
      ),
    );
    return Promise.all(
      summaries.map((summary) => this.attachCacheStatus(summary)),
    );
  }

  async searchMovies(name: string, options: MovieLanguageOptions = {}) {
    const ytsMovies = filterYtsMoviesByLanguage(
      await this.ytsService.searchMovies(name),
      options.movieLanguage,
    );

    const summaries = await Promise.all(
      ytsMovies.map((movie) =>
        this.buildYtsSummary(movie, options.responseLanguage),
      ),
    );

    return Promise.all(
      summaries.map((summary) => this.attachCacheStatus(summary)),
    );
  }

  async getMovieDetails(movieId: number, responseLanguage?: MovieLanguage) {
    const movie = await this.ytsService.getMovieDetails(movieId);
    const localized = await this.getLocalizedYtsMovie(movie, responseLanguage);
    const omdb = await this.omdbService.getByImdbId(movie.imdb_code);
    const year = movie.year ?? parseYear(omdb?.Year);
    const omdbPoster = parseOmdbText(omdb?.Poster);
    const image =
      movie.medium_cover_image ??
      movie.large_cover_image ??
      movie.small_cover_image ??
      omdbPoster;
    const coverImage =
      movie.large_cover_image ??
      movie.medium_cover_image ??
      movie.small_cover_image ??
      omdbPoster;
    const availability = await this.justWatchService.getAvailability(
      movie.title,
      year,
    );
    const cacheStatus = await this.streamingService.getCacheStatus(movieId);
    const streamAvailable = cacheStatus.cached || hasStreamableYtsMovie(movie);

    return {
      provider: 'yts',
      provider_id: String(movie.id),
      id: movie.id,
      name: localized?.name ?? movie.title,
      imdb_rating: parseImdbRating(omdb?.imdbRating),
      imdb_votes: parseOmdbText(omdb?.imdbVotes),
      year,
      released: parseOmdbText(omdb?.Released),
      rated: parseOmdbText(omdb?.Rated),
      runtime: movie.runtime ?? parseRuntime(omdb?.Runtime),
      genre: parseOmdbText(omdb?.Genre),
      director: parseOmdbText(omdb?.Director),
      writer: parseOmdbText(omdb?.Writer),
      cast: parseOmdbText(omdb?.Actors),
      plot:
        localized?.plot ?? parseOmdbText(omdb?.Plot) ?? parseMoviePlot(movie),
      language: parseOmdbText(omdb?.Language) ?? movie.language ?? null,
      original_language: movie.language ?? localized?.original_language ?? null,
      response_language: responseLanguage ?? 'en',
      country: parseOmdbText(omdb?.Country),
      awards: parseOmdbText(omdb?.Awards),
      production: parseOmdbText(omdb?.Production),
      box_office: parseOmdbText(omdb?.BoxOffice),
      subtitles: normalizeSubtitles(movie.subtitles),
      image: localized?.image ?? image ?? null,
      cover_image:
        localized?.backdrop ?? localized?.image ?? coverImage ?? null,
      cache_status: cacheStatus,
      stream_available: streamAvailable,
      sources: ['yts', 'omdb', 'justwatch'],
      availability,
    };
  }

  async getMovieDetailsFromProvider(
    provider: MovieProviderName,
    providerId: string,
    responseLanguage?: MovieLanguage,
  ) {
    if (provider === 'yts') {
      const movieId = Number(providerId);
      if (!Number.isFinite(movieId)) {
        throw new NotFoundException('Movie not found');
      }
      return this.getMovieDetails(movieId, responseLanguage);
    }

    if (provider !== 'tmdb') {
      throw new NotFoundException('Movie not found');
    }

    const tmdbDetails = await this.tmdbProvider.getMovieDetails(
      providerId,
      responseLanguage,
    );
    if (!tmdbDetails) {
      throw new NotFoundException('Movie not found');
    }

    let omdb = await this.omdbService.getByImdbId(
      tmdbDetails.imdb_id ?? undefined,
    );
    if (!omdb) {
      omdb = await this.omdbService.getByTitle(
        tmdbDetails.name,
        tmdbDetails.year ?? null,
      );
    }
    const year = tmdbDetails.year ?? parseYear(omdb?.Year);
    const availability = await this.justWatchService.getAvailability(
      tmdbDetails.name,
      year,
    );

    return {
      provider: 'tmdb',
      provider_id: tmdbDetails.provider_id,
      id: tmdbDetails.provider_id,
      name: tmdbDetails.name,
      imdb_rating: parseImdbRating(omdb?.imdbRating),
      imdb_votes: parseOmdbText(omdb?.imdbVotes),
      year,
      released: parseOmdbText(omdb?.Released),
      rated: parseOmdbText(omdb?.Rated),
      runtime: tmdbDetails.runtime ?? parseRuntime(omdb?.Runtime),
      genre: parseOmdbText(omdb?.Genre),
      director: parseOmdbText(omdb?.Director),
      writer: parseOmdbText(omdb?.Writer),
      cast: parseOmdbText(omdb?.Actors),
      plot: tmdbDetails.plot ?? parseOmdbText(omdb?.Plot),
      language: parseOmdbText(omdb?.Language),
      original_language: tmdbDetails.original_language ?? null,
      response_language: responseLanguage ?? 'en',
      country: parseOmdbText(omdb?.Country),
      awards: parseOmdbText(omdb?.Awards),
      production: parseOmdbText(omdb?.Production),
      box_office: parseOmdbText(omdb?.BoxOffice),
      subtitles: [],
      image: tmdbDetails.image ?? null,
      backdrop: tmdbDetails.backdrop ?? null,
      cover_image: tmdbDetails.backdrop ?? tmdbDetails.image ?? null,
      cache_status: null,
      sources: ['tmdb', 'omdb', 'justwatch'],
      availability,
    };
  }

  private async attachCacheStatus(
    summary: MovieSummary,
  ): Promise<MovieSummary> {
    if (summary.provider !== 'yts' || typeof summary.id !== 'number') {
      return { ...summary, cache_status: null };
    }
    const cacheStatus = await this.streamingService
      .getCacheStatus(summary.id)
      .catch(() => null);
    return { ...summary, cache_status: cacheStatus };
  }

  private async buildYtsSummary(
    movie: YtsMovieSummary,
    responseLanguage?: MovieLanguage,
  ): Promise<MovieSummary> {
    const summary = buildYtsSummary(movie, responseLanguage);
    const localized = await this.getLocalizedYtsMovie(movie, responseLanguage);
    if (!localized) {
      return summary;
    }

    return {
      ...summary,
      name: localized.name,
      year: summary.year ?? localized.year ?? null,
      rating: summary.rating ?? localized.rating ?? null,
      imdb_rating: summary.imdb_rating ?? localized.rating ?? null,
      plot: localized.plot ?? summary.plot,
      image: localized.image ?? summary.image,
      cover_image: localized.backdrop ?? localized.image ?? summary.cover_image,
      backdrop: localized.backdrop ?? summary.backdrop,
      sources: Array.from(new Set([...summary.sources, 'tmdb'])),
    };
  }

  private async getLocalizedYtsMovie(
    movie: YtsMovieSummary,
    responseLanguage?: MovieLanguage,
  ): Promise<MovieSearchResult | null> {
    if (!shouldLocalize(responseLanguage)) {
      return null;
    }
    return this.tmdbProvider
      .getMovieByImdbId(movie.imdb_code, responseLanguage)
      .catch(() => null);
  }

  private async fetchPaginatedMovies(
    pagination: MovieListPagination,
  ): Promise<YtsMovieSummary[]> {
    const limit = clampNumber(pagination.limit, 1, 50, 20);
    const page = clampNumber(pagination.page, 1, 1000, 1);
    const offset = normalizeOffset(pagination.offset, (1000 - 1) * limit);

    if (pagination.movieLanguage) {
      return this.fetchFilteredYtsMovies({
        limit,
        offset: offset ?? (page - 1) * limit,
        language: pagination.movieLanguage,
      });
    }

    if (typeof offset === 'number') {
      return this.fetchMoviesByOffset(offset, limit);
    }

    return this.ytsService.listMovies({ limit, page });
  }

  private async fetchFilteredYtsMovies({
    limit,
    offset,
    language,
    year,
    ytsOptions = {},
  }: FetchFilteredYtsMoviesOptions): Promise<YtsMovieSummary[]> {
    const target = offset + limit;
    const collected: YtsMovieSummary[] = [];
    const ytsLimit = 50;
    let page = 1;

    while (collected.length < target && page <= 100) {
      const movies = await this.ytsService.listMovies({
        ...ytsOptions,
        limit: ytsLimit,
        page,
      });
      if (!movies.length) {
        break;
      }

      collected.push(
        ...movies.filter(
          (movie) =>
            (!language || hasMovieLanguage(movie.language, language)) &&
            (!year || movie.year === year),
        ),
      );

      if (movies.length < ytsLimit) {
        break;
      }
      page += 1;
    }

    return collected.slice(offset, offset + limit);
  }

  private async fetchMoviesByOffset(
    offset: number,
    limit: number,
  ): Promise<YtsMovieSummary[]> {
    const page = Math.floor(offset / limit) + 1;
    const skip = offset % limit;
    const firstPage = await this.ytsService.listMovies({ limit, page });

    if (skip === 0) {
      return firstPage.slice(0, limit);
    }

    const selected = firstPage.slice(skip);
    if (selected.length >= limit || firstPage.length < limit) {
      return selected.slice(0, limit);
    }

    const secondPage = await this.ytsService.listMovies({
      limit,
      page: page + 1,
    });
    return selected.concat(secondPage).slice(0, limit);
  }

  async resolveTmdbToYtsId(providerId: string): Promise<number | null> {
    const tmdbDetails = await this.tmdbProvider.getMovieDetails(providerId);
    if (!tmdbDetails) {
      return null;
    }

    const imdbId =
      tmdbDetails.imdb_id ??
      (await this.getOmdbImdbId(tmdbDetails.name, tmdbDetails.year)) ??
      null;
    if (imdbId) {
      const byImdb = await this.ytsService.findMovieByImdbId(imdbId);
      if (byImdb) {
        return byImdb.id;
      }
    }

    const ytsMatches = await this.ytsService.searchMovies(tmdbDetails.name);
    const match = pickBestYtsMatch(ytsMatches, tmdbDetails.year ?? null);
    return match?.id ?? null;
  }

  private async getOmdbImdbId(
    title: string,
    year?: number | null,
  ): Promise<string | null> {
    const omdb = await this.omdbService.getByTitle(title, year ?? null);
    if (!omdb) {
      return null;
    }
    return parseOmdbText(omdb.imdbID) ?? null;
  }
}

export interface MovieSummary {
  id: number | string;
  provider: MovieProviderName;
  provider_id: string;
  name: string;
  year: number | null;
  rating: number | null;
  imdb_rating: number | null;
  runtime: number | null;
  plot: string | null;
  language: string | null;
  original_language: string | null;
  response_language: MovieLanguage;
  image: string | null;
  cover_image: string | null;
  backdrop?: string | null;
  genres?: string[];
  views?: number | null;
  likes?: number | null;
  sources: string[];
  cache_status?: unknown;
  stream_available?: boolean;
}

export interface PopularMovieFilters {
  type?: string;
  year?: number;
  sortBy?: string;
  orderBy?: string;
  quality?: string;
  minimumRating?: number;
  limit?: number;
  page?: number;
  responseLanguage?: MovieLanguage;
  movieLanguage?: MovieLanguage;
}

export interface MovieListPagination {
  page?: number;
  offset?: number;
  limit?: number;
  responseLanguage?: MovieLanguage;
  movieLanguage?: MovieLanguage;
}

export type MovieLanguage = 'en' | 'fr' | 'ar';

export interface MovieLanguageOptions {
  responseLanguage?: MovieLanguage;
  movieLanguage?: MovieLanguage;
}

interface FetchFilteredYtsMoviesOptions {
  limit: number;
  offset: number;
  language?: MovieLanguage;
  year?: number | null;
  ytsOptions?: YtsListMoviesOptions;
}

function buildYtsSummary(
  movie: YtsMovieSummary,
  responseLanguage: MovieLanguage = 'en',
): MovieSummary {
  const year =
    typeof movie.year === 'number' && movie.year > 0 ? movie.year : null;
  const rating =
    typeof movie.rating === 'number' && movie.rating > 0 ? movie.rating : null;
  const image =
    movie.medium_cover_image ??
    movie.large_cover_image ??
    movie.small_cover_image ??
    null;
  const coverImage =
    movie.large_cover_image ??
    movie.medium_cover_image ??
    movie.small_cover_image ??
    null;
  const genres = Array.isArray(movie.genres)
    ? movie.genres.filter(Boolean)
    : [];

  return {
    id: movie.id,
    provider: 'yts',
    provider_id: String(movie.id),
    name: movie.title,
    year,
    rating,
    imdb_rating: rating,
    runtime:
      typeof movie.runtime === 'number' && movie.runtime > 0
        ? movie.runtime
        : null,
    plot: parseMoviePlot(movie),
    language: movie.language ?? null,
    original_language: movie.language ?? null,
    response_language: responseLanguage,
    image,
    cover_image: coverImage,
    backdrop: coverImage,
    genres,
    views:
      typeof movie.download_count === 'number' ? movie.download_count : null,
    likes: typeof movie.like_count === 'number' ? movie.like_count : null,
    sources: ['yts'],
    stream_available: hasStreamableYtsMovie(movie),
  };
}

function parseImdbRating(value?: string): number | null {
  if (!value || value === 'N/A') {
    return null;
  }
  const rating = Number.parseFloat(value);
  return Number.isFinite(rating) ? rating : null;
}

function parseYear(value?: string): number | null {
  if (!value || value === 'N/A') {
    return null;
  }
  const year = Number.parseInt(value, 10);
  return Number.isFinite(year) ? year : null;
}

function parseRuntime(value?: string): number | null {
  if (!value || value === 'N/A') {
    return null;
  }
  const match = /(\d+)/.exec(value);
  if (!match) {
    return null;
  }
  const runtime = Number.parseInt(match[1], 10);
  return Number.isFinite(runtime) ? runtime : null;
}

function parseOmdbText(value?: string): string | null {
  if (!value || value === 'N/A') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseMoviePlot(movie: {
  description_full?: string;
  summary?: string;
  synopsis?: string;
}): string | null {
  return (
    parseOmdbText(movie.description_full) ??
    parseOmdbText(movie.summary) ??
    parseOmdbText(movie.synopsis)
  );
}

function filterYtsMoviesByLanguage(
  movies: YtsMovieSummary[],
  language?: MovieLanguage,
): YtsMovieSummary[] {
  if (!language) {
    return movies;
  }
  return movies.filter((movie) => hasMovieLanguage(movie.language, language));
}

function hasStreamableYtsMovie(movie: YtsMovieSummary): boolean {
  if (!Array.isArray(movie.torrents)) {
    return true;
  }
  return movie.torrents.some(hasTorrentAvailability);
}

function hasTorrentAvailability(torrent: YtsTorrent): boolean {
  return (torrent.seeds || 0) > 0 || (torrent.peers || 0) > 0;
}

function hasMovieLanguage(
  language: string | null | undefined,
  expected: MovieLanguage,
): boolean {
  return normalizeMovieLanguage(language) === expected;
}

function normalizeMovieLanguage(
  language: string | null | undefined,
): MovieLanguage | null {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('fr') || normalized === 'french') {
    return 'fr';
  }
  if (
    normalized.startsWith('ar') ||
    normalized === 'arabic' ||
    normalized === 'العربية'
  ) {
    return 'ar';
  }
  if (normalized.startsWith('en') || normalized === 'english') {
    return 'en';
  }
  return null;
}

function shouldLocalize(language?: MovieLanguage): language is 'fr' | 'ar' {
  return language === 'fr' || language === 'ar';
}

function pickBestYtsMatch(
  movies: YtsMovieSummary[],
  year?: number | null,
): YtsMovieSummary | null {
  if (!movies.length) {
    return null;
  }
  if (typeof year === 'number') {
    const byYear = movies.find((movie) => movie.year === year);
    if (byYear) {
      return byYear;
    }
  }
  return movies[0] ?? null;
}

function normalizeSubtitles(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === 'string');
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>);
  }
  return [];
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function normalizeOffset(
  value: number | undefined,
  max: number,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(Math.max(Math.trunc(value), 0), max);
}

function normalizeYear(value?: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const year = Math.trunc(value);
  return year >= 1900 && year <= 2100 ? year : null;
}

function normalizeMinimumRating(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(Math.max(Math.trunc(value), 0), 9);
}

function normalizeGenre(value?: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized.toLowerCase() === 'all') {
    return undefined;
  }
  return normalized;
}

function normalizeOrder(value?: string): YtsOrderBy {
  return value === 'asc' ? 'asc' : 'desc';
}

function mapPopularSort(value?: string): YtsSortBy {
  switch (value) {
    case 'title':
      return 'title';
    case 'year':
      return 'year';
    case 'rating':
      return 'rating';
    case 'likes':
      return 'like_count';
    case 'seeds':
      return 'seeds';
    case 'latest':
      return 'date_added';
    case 'views':
    default:
      return 'download_count';
  }
}
