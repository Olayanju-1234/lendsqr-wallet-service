import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../database/database.constants.js';
import { NewUser, UserRow, UserStatus } from './user.types.js';

@Injectable()
export class UsersRepository {
  constructor(@Inject(KNEX) private readonly db: Knex) {}

  async insert(trx: Knex.Transaction, user: NewUser): Promise<UserRow> {
    const [row] = await trx<UserRow>('users').insert(user).returning('*');
    return row;
  }

  findById(id: string, db: Knex = this.db): Promise<UserRow | undefined> {
    return db<UserRow>('users').where({ id }).first();
  }

  findByEmail(email: string): Promise<UserRow | undefined> {
    return this.db<UserRow>('users').where({ email }).first();
  }

  // SELECT ... FOR SHARE: a concurrent block (an UPDATE on the row) waits until this transaction commits,
  // and a block that already committed is the version we read. So status cannot change under a transfer.
  lockForShare(trx: Knex.Transaction, ids: string[]): Promise<UserRow[]> {
    return trx<UserRow>('users').whereIn('id', ids).orderBy('id').forShare();
  }

  async updateStatus(
    id: string,
    status: UserStatus,
    reason: string | null,
  ): Promise<UserRow | undefined> {
    const [row] = await this.db<UserRow>('users')
      .where({ id })
      .update({
        status,
        blocked_reason: reason,
        blocked_at: status === UserStatus.Blocked ? this.db.fn.now() : null,
        updated_at: this.db.fn.now(),
      })
      .returning('*');
    return row;
  }
}
