import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import {
  YtsListResponse,
  YtsMovieDetails,
  YtsMovieDetailsResponse,
  YtsMovieSummary,
} from './yts.types';

export type YtsSortBy =
  | 'title'
  | 'year'
  | 'rating'
  | 'peers'
  | 'seeds'
  | 'download_count'
  | 'like_count'
  | 'date_added';

export type YtsOrderBy = 'asc' | 'desc';

export interface YtsListMoviesOptions {
  limit?: number;
  page?: number;
  quality?: string;
  minimumRating?: number;
  queryTerm?: string;
  genre?: string;
  sortBy?: YtsSortBy;
  orderBy?: YtsOrderBy;
}

@Injectable()
export class YtsService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://yts.am/api/v2',
      timeout: 15000,
    });
  }

  async listMovies(options: YtsListMoviesOptions = {}): Promise<YtsMovieSummary[]> {
    try {
      const response = await this.client.get<YtsListResponse>('/list_movies.json', {
        params: buildListMoviesParams(options),
      });
      if (response.data?.status !== 'ok') {
        throw new ServiceUnavailableException(
          response.data?.status_message || 'YTS returned an error',
        );
      }
      return response.data.data?.movies ?? [];
    } catch (error) {
      throw new ServiceUnavailableException('YTS request failed');
    }
  }

  async searchMovies(query: string): Promise<YtsMovieSummary[]> {
    try {
      const response = await this.client.get<YtsListResponse>('/list_movies.json', {
        params: buildListMoviesParams({ queryTerm: query }),
      });
      if (response.data?.status !== 'ok') {
        throw new ServiceUnavailableException(
          response.data?.status_message || 'YTS returned an error',
        );
      }
      return response.data.data?.movies ?? [];
    } catch (error) {
      throw new ServiceUnavailableException('YTS request failed');
    }
  }

  async getMovieDetails(movieId: number): Promise<YtsMovieDetails> {
    try {
      const response = await this.client.get<YtsMovieDetailsResponse>(
        '/movie_details.json',
        {
          params: { movie_id: movieId, with_images: true },
        },
      );
      if (response.data?.status !== 'ok') {
        throw new ServiceUnavailableException(
          response.data?.status_message || 'YTS returned an error',
        );
      }
      const movie = response.data.data?.movie;
      if (!movie) {
        throw new NotFoundException('Movie not found');
      }
      return movie;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('YTS request failed');
    }
  }

  async findMovieByImdbId(imdbId: string): Promise<YtsMovieSummary | null> {
    try {
      const response = await this.client.get<YtsListResponse>('/list_movies.json', {
        params: { query_term: imdbId },
      });
      if (response.data?.status !== 'ok') {
        return null;
      }
      const movies = response.data.data?.movies ?? [];
      return movies[0] ?? null;
    } catch (error) {
      return null;
    }
  }
}

function buildListMoviesParams(options: YtsListMoviesOptions): Record<string, string | number> {
  const params: Record<string, string | number> = {};

  if (typeof options.limit === 'number') {
    params.limit = options.limit;
  }
  if (typeof options.page === 'number') {
    params.page = options.page;
  }
  if (options.quality) {
    params.quality = options.quality;
  }
  if (typeof options.minimumRating === 'number') {
    params.minimum_rating = options.minimumRating;
  }
  if (options.queryTerm) {
    params.query_term = options.queryTerm;
  }
  if (options.genre) {
    params.genre = options.genre;
  }
  if (options.sortBy) {
    params.sort_by = options.sortBy;
  }
  if (options.orderBy) {
    params.order_by = options.orderBy;
  }

  return params;
}
