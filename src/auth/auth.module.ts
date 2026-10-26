import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BlacklistModule } from '../blacklist/blacklist.module.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { UsersModule } from '../users/users.module.js';
import { WalletsModule } from '../wallets/wallets.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN_SECONDS', { infer: true }),
        },
      }),
    }),
    UsersModule,
    WalletsModule,
    BlacklistModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
