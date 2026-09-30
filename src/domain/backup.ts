import type { Snapshot } from '../adapters/storage/Storage';
import type { Id } from './types';

/** Everything a backup restores: every record, plus each reading's recording by reading id. */
export interface Backup extends Snapshot {
  audio: Map<Id, Float32Array>;
}
