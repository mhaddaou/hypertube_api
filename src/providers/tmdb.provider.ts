import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import {
  MovieDetailsResult,
  MovieProvider,
  MovieSearchResult,
} from './movie-provider.types';

interface TmdbSearchResponse {
  results?: TmdbSearchMovie[];
}

interface TmdbSearchMovie {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string | null;
  original_language?: string | null;
  vote_average?: number | null;
}

interface TmdbMovieDetails {
  id: number;
  title: string;
  release_date?: string;
  runtime?: number | null;
  imdb_id?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string | null;
  original_language?: string | null;
}

interface TmdbFindResponse {
  movie_results?: TmdbSearchMovie[];
}

@Injectable()
export class TmdbProvider implements MovieProvider {
  name: 'tmdb' = 'tmdb';
  private client: AxiosInstance;
  private apiKey?: string;
  private imageBase = 'https://image.tmdb.org/t/p';

  constructor() {
    this.apiKey = process.env.TMDB_API_KEY;
    this.client = axios.create({
      baseURL: 'https://api.themoviedb.org/3',
      timeout: 15000,
    });
  }

  async searchMovies(
    query: string,
    language?: string,
  ): Promise<MovieSearchResult[]> {
    if (!this.apiKey) {
      return [];
    }

    const response = await this.client.get<TmdbSearchResponse>(
      '/search/movie',
      {
        params: {
          api_key: this.apiKey,
          query,
          include_adult: false,
          language: mapTmdbLanguage(language),
        },
      },
    );

    const results = response.data?.results ?? [];
    return results.map((movie) => ({
      provider: this.name,
      provider_id: String(movie.id),
      name: movie.title,
      year: parseYear(movie.release_date),
      rating:
        typeof movie.vote_average === 'number' ? movie.vote_average : null,
      plot: parseText(movie.overview),
      original_language: parseText(movie.original_language),
      image: buildImageUrl(this.imageBase, movie.poster_path),
      backdrop: buildBackdropUrl(this.imageBase, movie.backdrop_path),
    }));
  }

  async getMovieDetails(
    providerId: string,
    language?: string,
  ): Promise<MovieDetailsResult | null> {
    if (!this.apiKey) {
      return null;
    }

    const response = await this.client.get<TmdbMovieDetails>(
      `/movie/${providerId}`,
      {
        params: { api_key: this.apiKey, language: mapTmdbLanguage(language) },
      },
    );

    const movie = response.data;
    if (!movie?.id) {
      return null;
    }

    return {
      provider: this.name,
      provider_id: String(movie.id),
      name: movie.title,
      year: parseYear(movie.release_date),
      runtime: movie.runtime ?? null,
      imdb_id: movie.imdb_id ?? null,
      plot: parseText(movie.overview),
      original_language: parseText(movie.original_language),
      image: buildImageUrl(this.imageBase, movie.poster_path),
      backdrop: buildBackdropUrl(this.imageBase, movie.backdrop_path),
    };
  }

  async getMovieByImdbId(
    imdbId: string | undefined,
    language?: string,
  ): Promise<MovieSearchResult | null> {
    if (!this.apiKey || !imdbId) {
      return null;
    }

    const response = await this.client.get<TmdbFindResponse>(
      `/find/${imdbId}`,
      {
        params: {
          api_key: this.apiKey,
          external_source: 'imdb_id',
          language: mapTmdbLanguage(language),
        },
      },
    );

    const movie = response.data?.movie_results?.[0];
    if (!movie?.id) {
      return null;
    }

    return {
      provider: this.name,
      provider_id: String(movie.id),
      name: movie.title,
      year: parseYear(movie.release_date),
      rating:
        typeof movie.vote_average === 'number' ? movie.vote_average : null,
      plot: parseText(movie.overview),
      original_language: parseText(movie.original_language),
      image: buildImageUrl(this.imageBase, movie.poster_path),
      backdrop: buildBackdropUrl(this.imageBase, movie.backdrop_path),
    };
  }
}

function parseYear(date?: string): number | null {
  if (!date) {
    return null;
  }
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function buildImageUrl(base: string, path?: string | null): string | null {
  if (!path) {
    return null;
  }
  return `${base}/w500${path}`;
}

function buildBackdropUrl(base: string, path?: string | null): string | null {
  if (!path) {
    return null;
  }
  return `${base}/w780${path}`;
}

function parseText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapTmdbLanguage(language?: string): string | undefined {
  switch (language) {
    case 'ar':
      return 'ar-SA';
    case 'fr':
      return 'fr-FR';
    case 'en':
      return 'en-US';
    default:
      return undefined;
  }
}
