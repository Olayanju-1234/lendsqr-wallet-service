import type { Request } from 'express';
import type { UserResponse, UserStatus } from '../users/user.types.js';
import type { WalletResponse } from '../wallets/wallet.types.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  status: UserStatus;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

export interface JwtPayload {
  sub: string;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface SignupResponse extends TokenResponse {
  user: UserResponse;
  wallet: WalletResponse;
}
