import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { EnvironmentVariables } from '../../config/env.validation.js';

const sha256 = (value: string): Buffer =>
  createHash('sha256').update(value).digest();

@Injectable()
export class AdminKeyGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.expected = sha256(config.get('ADMIN_API_KEY', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const provided = context
      .switchToHttp()
      .getRequest<Request>()
      .header('x-admin-key');
    // Hashing first gives equal-length buffers, so the comparison takes the same time whatever was sent.
    if (!provided || !timingSafeEqual(sha256(provided), this.expected)) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }
}
