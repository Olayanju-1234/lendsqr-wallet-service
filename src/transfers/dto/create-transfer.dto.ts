import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_AMOUNT_KOBO } from '../../wallets/wallet.types.js';

export class CreateTransferDto {
  @IsUUID()
  recipientWalletId: string;

  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_KOBO)
  amount: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(255)
  description?: string;
}
