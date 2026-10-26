export const BLACKLIST_PROVIDER = Symbol('BLACKLIST_PROVIDER');

export interface BlacklistProvider {
  isBlacklisted(identity: string): Promise<boolean>;
}
