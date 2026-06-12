export interface YtsListResponse {
  status: string;
  status_message?: string;
  data?: {
    movies?: YtsMovieSummary[];
  };
}

export interface YtsMovieSummary {
  id: number;
  title: string;
  imdb_code?: string;
  year?: number;
  rating?: number;
  small_cover_image?: string;
  medium_cover_image?: string;
  large_cover_image?: string;
}

export interface YtsMovieDetailsResponse {
  status: string;
  status_message?: string;
  data?: {
    movie?: YtsMovieDetails;
  };
}

export interface YtsMovieDetails {
  id: number;
  title: string;
  imdb_code?: string;
  year?: number;
  runtime?: number;
  small_cover_image?: string;
  medium_cover_image?: string;
  large_cover_image?: string;
  torrents?: YtsTorrent[];
  subtitles?: unknown;
}

export interface YtsTorrent {
  hash: string;
  quality: string;
  type?: string;
  seeds: number;
  peers: number;
  size_bytes?: number;
}
