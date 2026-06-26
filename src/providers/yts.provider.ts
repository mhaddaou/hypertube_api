import { Injectable, NotFoundException } from '@nestjs/common';
import { YtsService } from '../yts/yts.service';
import {
  MovieDetailsResult,
  MovieProvider,
  MovieSearchResult,
} from './movie-provider.types';

@Injectable()
export class YtsProvider implements MovieProvider {
  name: 'yts' = 'yts';

  constructor(private readonly ytsService: YtsService) {}

  async searchMovies(query: string): Promise<MovieSearchResult[]> {
    const movies = await this.ytsService.searchMovies(query);
    return movies.map((movie) => ({
      provider: this.name,
      provider_id: String(movie.id),
      name: movie.title,
      year: movie.year ?? null,
      rating: typeof movie.rating === 'number' ? movie.rating : null,
      plot: parseMoviePlot(movie),
      original_language: parseText(movie.language),
      image:
        movie.medium_cover_image ??
        movie.large_cover_image ??
        movie.small_cover_image ??
        null,
      backdrop:
        movie.large_cover_image ??
        movie.medium_cover_image ??
        movie.small_cover_image ??
        null,
    }));
  }

  async getMovieDetails(
    providerId: string,
  ): Promise<MovieDetailsResult | null> {
    const movieId = Number(providerId);
    if (!Number.isFinite(movieId)) {
      return null;
    }

    try {
      const movie = await this.ytsService.getMovieDetails(movieId);
      return {
        provider: this.name,
        provider_id: String(movie.id),
        name: movie.title,
        year: movie.year ?? null,
        runtime: movie.runtime ?? null,
        imdb_id: movie.imdb_code ?? null,
        plot: parseMoviePlot(movie),
        original_language: parseText(movie.language),
        image:
          movie.medium_cover_image ??
          movie.large_cover_image ??
          movie.small_cover_image ??
          null,
        backdrop:
          movie.large_cover_image ??
          movie.medium_cover_image ??
          movie.small_cover_image ??
          null,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }
}

function parseMoviePlot(movie: {
  description_full?: string;
  summary?: string;
  synopsis?: string;
}): string | null {
  return (
    parseText(movie.description_full) ??
    parseText(movie.summary) ??
    parseText(movie.synopsis)
  );
}

function parseText(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
