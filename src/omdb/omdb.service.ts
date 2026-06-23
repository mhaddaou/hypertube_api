import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

interface OmdbMovie {
  imdbRating?: string;
  imdbVotes?: string;
  imdbID?: string;
  Year?: string;
  Rated?: string;
  Released?: string;
  Runtime?: string;
  Genre?: string;
  Director?: string;
  Writer?: string;
  Actors?: string;
  Plot?: string;
  Language?: string;
  Country?: string;
  Awards?: string;
  Production?: string;
  BoxOffice?: string;
  Poster?: string;
  Response?: string;
  Error?: string;
}

@Injectable()
export class OmdbService {
  private client: AxiosInstance;
  private cache = new Map<string, OmdbMovie>();
  private apiKey?: string;

  constructor() {
    this.apiKey = process.env.OMDB_API_KEY;
    this.client = axios.create({
      baseURL: 'https://www.omdbapi.com/',
      timeout: 15000,
    });
  }

  async getByImdbId(imdbId?: string): Promise<OmdbMovie | null> {
    if (!imdbId || !this.apiKey) {
      return null;
    }

    const cacheKey = `id:${imdbId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this.client.get<OmdbMovie>('/', {
      params: { i: imdbId, apikey: this.apiKey },
    });

    if (response.data?.Response === 'False') {
      return null;
    }

    this.cache.set(cacheKey, response.data);
    return response.data;
  }

  async getByTitle(title?: string, year?: number | null): Promise<OmdbMovie | null> {
    if (!title || !this.apiKey) {
      return null;
    }

    const normalizedTitle = title.trim().toLowerCase();
    const yearKey = typeof year === 'number' ? String(year) : '';
    const cacheKey = `title:${normalizedTitle}:${yearKey}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this.client.get<OmdbMovie>('/', {
      params: {
        t: title,
        y: typeof year === 'number' ? year : undefined,
        apikey: this.apiKey,
      },
    });

    if (response.data?.Response === 'False') {
      return null;
    }

    this.cache.set(cacheKey, response.data);
    return response.data;
  }
}
