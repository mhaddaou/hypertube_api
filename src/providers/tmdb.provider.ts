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

  async searchMovies(query: string): Promise<MovieSearchResult[]> {
    if (!this.apiKey) {
      return [];
    }

    const response = await this.client.get<TmdbSearchResponse>('/search/movie', {
      params: {
        api_key: this.apiKey,
        query,
        include_adult: false,
      },
    });

    const results = response.data?.results ?? [];
    return results.map((movie) => ({
      provider: this.name,
      provider_id: String(movie.id),
      name: movie.title,
      year: parseYear(movie.release_date),
      rating: typeof movie.vote_average === 'number' ? movie.vote_average : null,
      image: buildImageUrl(this.imageBase, movie.poster_path),
      backdrop: buildBackdropUrl(this.imageBase, movie.backdrop_path),
    }));
  }

  async getMovieDetails(providerId: string): Promise<MovieDetailsResult | null> {
    if (!this.apiKey) {
      return null;
    }

    const response = await this.client.get<TmdbMovieDetails>(`/movie/${providerId}`, {
      params: { api_key: this.apiKey },
    });

    const movie = response.data;
    if (!movie?.id) {
      return null;
    }

    return {
      provider: this.name,
      provider_id: String(movie.id),
      name: movie.title,
      year: parseYear(movie.release_date),
      length: movie.runtime ?? null,
      imdb_id: movie.imdb_id ?? null,
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
