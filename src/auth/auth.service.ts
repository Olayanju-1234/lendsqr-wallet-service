import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { Knex } from 'knex';
import { BlacklistService } from '../blacklist/blacklist.service.js';
import { isUniqueViolation } from '../common/postgres-errors.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { KNEX } from '../database/database.constants.js';
import { toUserResponse, type UserRow } from '../users/user.types.js';
import { UsersRepository } from '../users/users.repository.js';
import { toWalletResponse } from '../wallets/wallet.types.js';
import { WalletsRepository } from '../wallets/wallets.repository.js';
import type {
  JwtPayload,
  SignupResponse,
  TokenResponse,
} from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { SignupDto } from './dto/signup.dto.js';

const BCRYPT_ROUNDS = 10;
const DUPLICATE_MESSAGE =
  'An account with this email or phone number already exists';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly expiresIn: number;
  // Compared against when the email is unknown, so login takes the same time either way.
  private readonly dummyHash = bcrypt.hashSync(
    'not-a-real-password',
    BCRYPT_ROUNDS,
  );

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly users: UsersRepository,
    private readonly wallets: WalletsRepository,
    private readonly blacklist: BlacklistService,
    private readonly jwt: JwtService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.expiresIn = config.get('JWT_EXPIRES_IN_SECONDS', { infer: true });
  }

  async signup(dto: SignupDto): Promise<SignupResponse> {
    // bcrypt hashes at most 72 bytes; MaxLength counts characters, so multi-byte passwords need this check.
    if (bcrypt.truncates(dto.password)) {
      throw new BadRequestException('password must be at most 72 bytes');
    }
    // Cheapest check first: one indexed read before two Karma calls and a bcrypt hash.
    // The unique index on insert still decides when two signups race.
    if (await this.users.existsByEmailOrPhone(dto.email, dto.phoneNumber)) {
      throw new ConflictException(DUPLICATE_MESSAGE);
    }
    await this.blacklist.assertCanOnboard([dto.email, dto.phoneNumber]);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const { user, wallet } = await this.db.transaction(async (trx) => {
        const user = await this.users.insert(trx, {
          email: dto.email,
          phone_number: dto.phoneNumber,
          first_name: dto.firstName,
          last_name: dto.lastName,
          password_hash: passwordHash,
        });
        const wallet = await this.wallets.insertForUser(trx, user.id);
        return { user, wallet };
      });

      this.logger.log(`User ${user.id} signed up with wallet ${wallet.id}`);
      return {
        user: toUserResponse(user),
        wallet: toWalletResponse(wallet),
        ...(await this.issueToken(user)),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(DUPLICATE_MESSAGE);
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<TokenResponse> {
    const user = await this.users.findByEmail(dto.email);
    const matches = await bcrypt.compare(
      dto.password,
      user?.password_hash ?? this.dummyHash,
    );
    if (!user || !matches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueToken(user);
  }

  private async issueToken(user: UserRow): Promise<TokenResponse> {
    const payload: JwtPayload = { sub: user.id };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.expiresIn,
    };
  }
}
