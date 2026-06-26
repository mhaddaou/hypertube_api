export type MovieProviderName = 'yts' | 'tmdb';

export interface MovieSearchResult {
  provider: MovieProviderName;
  provider_id: string;
  name: string;
  year?: number | null;
  rating?: number | null;
  plot?: string | null;
  original_language?: string | null;
  image?: string | null;
  backdrop?: string | null;
}

export interface MovieDetailsResult {
  provider: MovieProviderName;
  provider_id: string;
  name: string;
  year?: number | null;
  runtime?: number | null;
  imdb_id?: string | null;
  plot?: string | null;
  original_language?: string | null;
  image?: string | null;
  backdrop?: string | null;
}

export interface MovieProvider {
  name: MovieProviderName;
  searchMovies(query: string, language?: string): Promise<MovieSearchResult[]>;
  getMovieDetails(
    providerId: string,
    language?: string,
  ): Promise<MovieDetailsResult | null>;
}
