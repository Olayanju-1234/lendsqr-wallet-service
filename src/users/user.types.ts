export enum UserStatus {
  Active = 'active',
  Blocked = 'blocked',
}

export interface UserRow {
  id: string;
  email: string;
  phone_number: string;
  first_name: string;
  last_name: string;
  password_hash: string;
  status: UserStatus;
  blocked_reason: string | null;
  blocked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type NewUser = Pick<
  UserRow,
  'email' | 'phone_number' | 'first_name' | 'last_name' | 'password_hash'
>;

export interface UserResponse {
  id: string;
  email: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  createdAt: Date;
}

// The reason is an admin's note about the user, so only admin responses carry it.
export interface AdminUserResponse extends UserResponse {
  blockedReason: string | null;
  blockedAt: Date | null;
}

export function toUserResponse(user: UserRow): UserResponse {
  return {
    id: user.id,
    email: user.email,
    phoneNumber: user.phone_number,
    firstName: user.first_name,
    lastName: user.last_name,
    status: user.status,
    createdAt: user.created_at,
  };
}

export function toAdminUserResponse(user: UserRow): AdminUserResponse {
  return {
    ...toUserResponse(user),
    blockedReason: user.blocked_reason,
    blockedAt: user.blocked_at,
  };
}
