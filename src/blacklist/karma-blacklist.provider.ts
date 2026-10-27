import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { BlacklistProvider } from './blacklist.provider.js';

interface KarmaLookupResponse {
  status?: string;
  'mock-response'?: string;
  data?: { karma_identity?: string | null } | null;
}

const KARMA_TIMEOUT_MS = 5000;

@Injectable()
export class KarmaBlacklistProvider implements BlacklistProvider {
  private readonly logger = new Logger(KarmaBlacklistProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.baseUrl = config.get('ADJUTOR_BASE_URL', { infer: true });
    this.apiKey = config.get('ADJUTOR_API_KEY', { infer: true }) ?? '';
  }

  // Fails closed: if Karma cannot answer, we refuse to onboard rather than risk letting a blacklisted user in.
  async isBlacklisted(identity: string): Promise<boolean> {
    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}/verification/karma/${encodeURIComponent(identity)}`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: AbortSignal.timeout(KARMA_TIMEOUT_MS),
        },
      );
    } catch (error) {
      this.logger.error(
        `Karma lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw this.unavailable();
    }

    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      this.logger.error(`Karma lookup returned HTTP ${response.status}`);
      throw this.unavailable();
    }

    const body = (await response.json()) as KarmaLookupResponse;
    const hit = body.data?.karma_identity;
    if (body.status !== 'success' || !hit) {
      return false;
    }
    // An Adjutor app in test mode answers every lookup with the same sample record. Treating that as a hit
    // would blacklist everyone, so in test mode a hit only counts when it is for the identity we asked about.
    if (body['mock-response']) {
      this.logger.warn(
        'Adjutor app is in test mode: Karma returned a mock record',
      );
      return hit.toLowerCase() === identity.toLowerCase();
    }
    return true;
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'Blacklist check is temporarily unavailable. Please try again later.',
    );
  }
}
