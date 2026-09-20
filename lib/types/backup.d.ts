import type { CheckinBackup } from './types.ts';
export declare const CHECKIN_BACKUP_MAX_BYTES: number;
export declare function assertBackupSize(json: string): void;
/** Strictly parse a portable backup in both the browser and Host. */
export declare function parseCheckinBackup(json: string, today?: string): CheckinBackup;
