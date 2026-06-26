export type MovieProviderName = 'yts' | 'tmdb';

export interface MovieSearchResult {
  provider: MovieProviderName;
  provider_id: string;
  name: string;
  year?: number | null;
  rating?: number | null;
  plot?: string | null;
  image?: string | null;
  backdrop?: string | null;
}

export interface MovieDetailsResult {
  provider: MovieProviderName;
  provider_id: string;
  name: string;
  year?: number | null;
  length?: number | null;
  imdb_id?: string | null;
  plot?: string | null;
  image?: string | null;
  backdrop?: string | null;
}

export interface MovieProvider {
  name: MovieProviderName;
  searchMovies(query: string): Promise<MovieSearchResult[]>;
  getMovieDetails(providerId: string): Promise<MovieDetailsResult | null>;
}
