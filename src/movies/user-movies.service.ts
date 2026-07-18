import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MoviesService } from './movies.service';

export interface UserMovieResponse {
  movie_id: number;
  watchlisted_at: Date | null;
  favorited_at: Date | null;
  watched_at: Date | null;
  movie: UserMovieSnapshot | null;
}

export interface UserMovieSnapshot {
  id: number;
  provider: 'yts';
  provider_id: string;
  name: string | null;
  year: number | null;
  rating: number | null;
  imdb_rating: number | null;
  plot: string | null;
  image: string | null;
  cover_image: string | null;
}

interface UserMovieRow {
  movieId: number;
  watchlistedAt: Date | null;
  favoritedAt: Date | null;
  watchedAt: Date | null;
  title: string | null;
  year: number | null;
  rating: number | null;
  plot: string | null;
  image: string | null;
  coverImage: string | null;
}

interface MovieDetailsSnapshot {
  name?: unknown;
  year?: unknown;
  rating?: unknown;
  imdb_rating?: unknown;
  plot?: unknown;
  image?: unknown;
  cover_image?: unknown;
}

interface MovieSnapshotData {
  title: string | null;
  year: number | null;
  rating: number | null;
  plot: string | null;
  image: string | null;
  coverImage: string | null;
}

@Injectable()
export class UserMoviesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moviesService: MoviesService,
  ) {}

  async listWatchlist(userId: string): Promise<UserMovieResponse[]> {
    const rows = await this.prisma.userMovie.findMany({
      where: {
        userId,
        watchlistedAt: { not: null },
      },
      orderBy: { watchlistedAt: 'desc' },
    });

    return rows.map((row) => this.toResponse(row));
  }

  async listFavorites(userId: string): Promise<UserMovieResponse[]> {
    const rows = await this.prisma.userMovie.findMany({
      where: {
        userId,
        favoritedAt: { not: null },
      },
      orderBy: { favoritedAt: 'desc' },
    });

    return rows.map((row) => this.toResponse(row));
  }

  async listWatched(userId: string): Promise<UserMovieResponse[]> {
    const rows = await this.prisma.userMovie.findMany({
      where: {
        userId,
        watchedAt: { not: null },
      },
      orderBy: { watchedAt: 'desc' },
    });

    return rows.map((row) => this.toResponse(row));
  }

  async addToWatchlist(
    userId: string,
    movieId: number,
  ): Promise<UserMovieResponse> {
    const snapshot = await this.fetchSnapshot(movieId);
    const row = await this.prisma.userMovie.upsert({
      where: { userId_movieId: { userId, movieId } },
      update: {
        ...snapshot,
        watchlistedAt: new Date(),
      },
      create: {
        userId,
        movieId,
        ...snapshot,
        watchlistedAt: new Date(),
      },
    });

    return this.toResponse(row);
  }

  async removeFromWatchlist(
    userId: string,
    movieId: number,
  ): Promise<UserMovieResponse> {
    return this.clearFlag(userId, movieId, 'watchlistedAt');
  }

  async addToFavorite(
    userId: string,
    movieId: number,
  ): Promise<UserMovieResponse> {
    const snapshot = await this.fetchSnapshot(movieId);
    const row = await this.prisma.userMovie.upsert({
      where: { userId_movieId: { userId, movieId } },
      update: {
        ...snapshot,
        favoritedAt: new Date(),
      },
      create: {
        userId,
        movieId,
        ...snapshot,
        favoritedAt: new Date(),
      },
    });

    return this.toResponse(row);
  }

  async removeFromFavorite(
    userId: string,
    movieId: number,
  ): Promise<UserMovieResponse> {
    return this.clearFlag(userId, movieId, 'favoritedAt');
  }

  async markWatched(
    userId: string,
    movieId: number,
  ): Promise<UserMovieResponse> {
    const snapshot = await this.fetchSnapshot(movieId);
    const row = await this.prisma.userMovie.upsert({
      where: { userId_movieId: { userId, movieId } },
      update: {
        ...snapshot,
        watchedAt: new Date(),
        watchlistedAt: null,
      },
      create: {
        userId,
        movieId,
        ...snapshot,
        watchedAt: new Date(),
      },
    });

    return this.toResponse(row);
  }

  async unmarkWatched(
    userId: string,
    movieId: number,
  ): Promise<UserMovieResponse> {
    return this.clearFlag(userId, movieId, 'watchedAt');
  }

  private async clearFlag(
    userId: string,
    movieId: number,
    field: 'watchlistedAt' | 'favoritedAt' | 'watchedAt',
  ): Promise<UserMovieResponse> {
    const row = await this.prisma.userMovie.findUnique({
      where: { userId_movieId: { userId, movieId } },
    });

    if (!row) {
      return emptyResponse(movieId);
    }

    const otherFlagsSet = (
      ['watchlistedAt', 'favoritedAt', 'watchedAt'] as const
    ).some((otherField) => otherField !== field && row[otherField] !== null);

    if (!otherFlagsSet) {
      await this.prisma.userMovie.delete({
        where: { userId_movieId: { userId, movieId } },
      });
      return emptyResponse(movieId);
    }

    const updated = await this.prisma.userMovie.update({
      where: { userId_movieId: { userId, movieId } },
      data: { [field]: null },
    });
    return this.toResponse(updated);
  }

  private async fetchSnapshot(movieId: number): Promise<MovieSnapshotData> {
    const movie = (await this.moviesService.getMovieDetails(
      movieId,
    )) as MovieDetailsSnapshot;

    return {
      title: parseString(movie.name),
      year: parseInteger(movie.year),
      rating: parseNumber(movie.imdb_rating) ?? parseNumber(movie.rating),
      plot: parseString(movie.plot),
      image: parseString(movie.image),
      coverImage: parseString(movie.cover_image),
    };
  }

  private toResponse(row: UserMovieRow): UserMovieResponse {
    return {
      movie_id: row.movieId,
      watchlisted_at: row.watchlistedAt,
      favorited_at: row.favoritedAt,
      watched_at: row.watchedAt,
      movie: {
        id: row.movieId,
        provider: 'yts',
        provider_id: String(row.movieId),
        name: row.title,
        year: row.year,
        rating: row.rating,
        imdb_rating: row.rating,
        plot: row.plot,
        image: row.image,
        cover_image: row.coverImage,
      },
    };
  }
}

function emptyResponse(movieId: number): UserMovieResponse {
  return {
    movie_id: movieId,
    watchlisted_at: null,
    favorited_at: null,
    watched_at: null,
    movie: null,
  };
}

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function parseNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
