import { Injectable, NotFoundException } from '@nestjs/common';
import { OmdbService } from '../omdb/omdb.service';
import { YtsService } from '../yts/yts.service';
import { JustWatchService } from '../providers/justwatch.service';
import { MovieProviderName, MovieSearchResult } from '../providers/movie-provider.types';
import { TmdbProvider } from '../providers/tmdb.provider';
import { YtsProvider } from '../providers/yts.provider';
import { StreamingService } from '../streaming/streaming.service';
import { YtsMovieSummary } from '../yts/yts.types';
import { YtsOrderBy, YtsSortBy } from '../yts/yts.service';

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

  async listMovies() {
    const movies = await this.ytsService.listMovies();
    const summaries = movies.map((movie) => buildYtsSummary(movie));
    return Promise.all(summaries.map((summary) => this.attachCacheStatus(summary)));
  }

  async listPopularMovies(filters: PopularMovieFilters) {
    const limit = clampNumber(filters.limit, 1, 50, 12);
    const page = clampNumber(filters.page, 1, 1000, 1);
    const year = normalizeYear(filters.year);
    const ytsLimit = year ? 50 : limit;

    const movies = await this.ytsService.listMovies({
      limit: ytsLimit,
      page,
      quality: filters.quality,
      minimumRating: normalizeMinimumRating(filters.minimumRating),
      genre: normalizeGenre(filters.type),
      sortBy: mapPopularSort(filters.sortBy),
      orderBy: normalizeOrder(filters.orderBy),
    });

    const filtered = year
      ? movies.filter((movie) => movie.year === year).slice(0, limit)
      : movies;
    const summaries = filtered.map((movie) => buildYtsSummary(movie));
    return Promise.all(summaries.map((summary) => this.attachCacheStatus(summary)));
  }

  async searchMovies(name: string) {
    const ytsResults = await this.ytsProvider.searchMovies(name);
    if (ytsResults.length) {
      const summaries = ytsResults.map((movie) => buildProviderSummary(movie));
      return Promise.all(summaries.map((summary) => this.attachCacheStatus(summary)));
    }

    const tmdbResults = await this.tmdbProvider.searchMovies(name);
    const enriched = await Promise.all(
      tmdbResults.map((movie) => this.enrichTmdbSummary(movie)),
    );
    return enriched.map((summary) => ({
      ...summary,
      cache_status: null,
    }));
  }

  async getMovieDetails(movieId: number) {
    const movie = await this.ytsService.getMovieDetails(movieId);
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
    const availability = await this.justWatchService.getAvailability(movie.title, year);
    const cacheStatus = await this.streamingService.getCacheStatus(movieId);

    return {
      provider: 'yts',
      provider_id: String(movie.id),
      id: movie.id,
      name: movie.title,
      imdb_rating: parseImdbRating(omdb?.imdbRating),
      imdb_votes: parseOmdbText(omdb?.imdbVotes),
      year,
      released: parseOmdbText(omdb?.Released),
      rated: parseOmdbText(omdb?.Rated),
      length: movie.runtime ?? parseRuntime(omdb?.Runtime),
      genre: parseOmdbText(omdb?.Genre),
      director: parseOmdbText(omdb?.Director),
      writer: parseOmdbText(omdb?.Writer),
      cast: parseOmdbText(omdb?.Actors),
      plot: parseOmdbText(omdb?.Plot),
      language: parseOmdbText(omdb?.Language),
      country: parseOmdbText(omdb?.Country),
      awards: parseOmdbText(omdb?.Awards),
      production: parseOmdbText(omdb?.Production),
      box_office: parseOmdbText(omdb?.BoxOffice),
      subtitles: normalizeSubtitles(movie.subtitles),
      image: image ?? null,
      cover_image: coverImage ?? null,
      cache_status: cacheStatus,
      sources: ['yts', 'omdb', 'justwatch'],
      availability,
    };
  }

  async getMovieDetailsFromProvider(provider: MovieProviderName, providerId: string) {
    if (provider === 'yts') {
      const movieId = Number(providerId);
      if (!Number.isFinite(movieId)) {
        throw new NotFoundException('Movie not found');
      }
      return this.getMovieDetails(movieId);
    }

    if (provider !== 'tmdb') {
      throw new NotFoundException('Movie not found');
    }

    const tmdbDetails = await this.tmdbProvider.getMovieDetails(providerId);
    if (!tmdbDetails) {
      throw new NotFoundException('Movie not found');
    }

    let omdb = await this.omdbService.getByImdbId(tmdbDetails.imdb_id ?? undefined);
    if (!omdb) {
      omdb = await this.omdbService.getByTitle(tmdbDetails.name, tmdbDetails.year ?? null);
    }
    const year = tmdbDetails.year ?? parseYear(omdb?.Year);
    const availability = await this.justWatchService.getAvailability(tmdbDetails.name, year);

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
      length: tmdbDetails.length ?? parseRuntime(omdb?.Runtime),
      genre: parseOmdbText(omdb?.Genre),
      director: parseOmdbText(omdb?.Director),
      writer: parseOmdbText(omdb?.Writer),
      cast: parseOmdbText(omdb?.Actors),
      plot: parseOmdbText(omdb?.Plot),
      language: parseOmdbText(omdb?.Language),
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

  private async attachCacheStatus(summary: MovieSummary): Promise<MovieSummary> {
    if (summary.provider !== 'yts' || typeof summary.id !== 'number') {
      return { ...summary, cache_status: null };
    }
    const cacheStatus = await this.streamingService
      .getCacheStatus(summary.id)
      .catch(() => null);
    return { ...summary, cache_status: cacheStatus };
  }

  private async enrichTmdbSummary(movie: MovieSearchResult): Promise<MovieSummary> {
    const baseSummary = buildProviderSummary(movie);
    let summary = { ...baseSummary };

    const needsTmdbDetails =
      summary.year === null ||
      summary.rating === null ||
      summary.image === null ||
      summary.cover_image === null;

    const tmdbDetails = needsTmdbDetails
      ? await this.tmdbProvider.getMovieDetails(movie.provider_id)
      : null;

    if (tmdbDetails) {
      summary = {
        ...summary,
        year: summary.year ?? tmdbDetails.year ?? null,
        image: summary.image ?? tmdbDetails.image ?? tmdbDetails.backdrop ?? null,
        cover_image: summary.cover_image ?? tmdbDetails.backdrop ?? tmdbDetails.image ?? null,
        backdrop: summary.backdrop ?? tmdbDetails.backdrop ?? null,
      };
    }

    const needsOmdb = summary.rating === null || summary.year === null || summary.image === null;
    if (needsOmdb) {
      let omdb = await this.omdbService.getByImdbId(tmdbDetails?.imdb_id ?? undefined);
      if (!omdb) {
        omdb = await this.omdbService.getByTitle(summary.name, summary.year);
      }

      if (omdb) {
        const omdbRating = parseImdbRating(omdb.imdbRating);
        const omdbYear = parseYear(omdb.Year);
        const omdbPoster = parseOmdbText(omdb.Poster);
        summary = {
          ...summary,
          rating: summary.rating ?? omdbRating,
          imdb_rating: summary.imdb_rating ?? omdbRating,
          year: summary.year ?? omdbYear,
          image: summary.image ?? omdbPoster,
          cover_image: summary.cover_image ?? omdbPoster,
          sources: Array.from(new Set([...summary.sources, 'omdb'])),
        };
      }
    }

    return summary;
  }

  async resolveTmdbToYtsId(providerId: string): Promise<number | null> {
    const tmdbDetails = await this.tmdbProvider.getMovieDetails(providerId);
    if (!tmdbDetails) {
      return null;
    }

    const imdbId = tmdbDetails.imdb_id ?? (await this.getOmdbImdbId(tmdbDetails.name, tmdbDetails.year)) ?? null;
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

  private async getOmdbImdbId(title: string, year?: number | null): Promise<string | null> {
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
  image: string | null;
  cover_image: string | null;
  backdrop?: string | null;
  genres?: string[];
  views?: number | null;
  likes?: number | null;
  sources: string[];
  cache_status?: unknown;
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
}

function buildYtsSummary(movie: YtsMovieSummary): MovieSummary {
  const year = typeof movie.year === 'number' && movie.year > 0 ? movie.year : null;
  const rating = typeof movie.rating === 'number' && movie.rating > 0 ? movie.rating : null;
  const image =
    movie.medium_cover_image ?? movie.large_cover_image ?? movie.small_cover_image ?? null;
  const coverImage =
    movie.large_cover_image ?? movie.medium_cover_image ?? movie.small_cover_image ?? null;
  const genres = Array.isArray(movie.genres) ? movie.genres.filter(Boolean) : [];

  return {
    id: movie.id,
    provider: 'yts',
    provider_id: String(movie.id),
    name: movie.title,
    year,
    rating,
    imdb_rating: rating,
    image,
    cover_image: coverImage,
    backdrop: coverImage,
    genres,
    views: typeof movie.download_count === 'number' ? movie.download_count : null,
    likes: typeof movie.like_count === 'number' ? movie.like_count : null,
    sources: ['yts'],
  };
}

function buildProviderSummary(movie: MovieSearchResult): MovieSummary {
  const id = movie.provider === 'yts' ? Number(movie.provider_id) : movie.provider_id;
  const year = typeof movie.year === 'number' && movie.year > 0 ? movie.year : null;
  const rating = typeof movie.rating === 'number' && movie.rating > 0 ? movie.rating : null;
  const image = movie.image ?? movie.backdrop ?? null;
  const coverImage = movie.backdrop ?? movie.image ?? null;

  return {
    id: Number.isFinite(id as number) ? (id as number) : movie.provider_id,
    provider: movie.provider,
    provider_id: movie.provider_id,
    name: movie.name,
    year,
    rating,
    imdb_rating: rating,
    image,
    cover_image: coverImage,
    backdrop: movie.backdrop ?? null,
    sources: [movie.provider],
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

function pickBestYtsMatch(movies: YtsMovieSummary[], year?: number | null): YtsMovieSummary | null {
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
