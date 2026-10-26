import { IsInt, Max, Min } from 'class-validator';
import { MAX_AMOUNT_KOBO } from '../wallet.types.js';

export class DepositDto {
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_KOBO)
  amount: number;
}
