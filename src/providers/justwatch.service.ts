import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface JustWatchAvailability {
  provider_id: number;
  url: string | null;
  monetization_type: string | null;
}

interface JustWatchSearchResponse {
  items?: JustWatchItem[];
}

interface JustWatchItem {
  original_release_year?: number;
  offers?: JustWatchOffer[];
}

interface JustWatchOffer {
  provider_id: number;
  monetization_type?: string;
  urls?: {
    standard_web?: string;
    deeplink_web?: string;
  };
}

@Injectable()
export class JustWatchService {
  private client: AxiosInstance;
  private country: string;

  constructor() {
    const baseUrl = process.env.JUSTWATCH_BASE_URL || 'https://apis.justwatch.com';
    this.country = (process.env.JUSTWATCH_COUNTRY || 'US').toUpperCase();
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async getAvailability(title: string, year?: number | null): Promise<JustWatchAvailability[]> {
    if (!title) {
      return [];
    }
    try {
      const response = await this.client.post<JustWatchSearchResponse>(
        `/content/titles/${this.country}/popular`,
        {
          query: title,
          page_size: 5,
          page: 1,
          content_types: ['movie'],
        },
      );

      const items = response.data?.items ?? [];
      if (!items.length) {
        return [];
      }

      const matched =
        typeof year === 'number'
          ? items.find((item) => item.original_release_year === year)
          : undefined;
      const target = matched ?? items[0];
      const offers = target?.offers ?? [];

      return offers.map((offer) => ({
        provider_id: offer.provider_id,
        url: offer.urls?.standard_web ?? offer.urls?.deeplink_web ?? null,
        monetization_type: offer.monetization_type ?? null,
      }));
    } catch {
      return [];
    }
  }
}
