/**
 * Agregación de PRs mergeadas para la gráfica de Code review. Envoltorio fino sobre
 * `timeBuckets` (la lógica genérica vive allí); se mantiene por compatibilidad.
 */
import { bucketItems, type Bucket, type DateRange, type Granularity } from './timeBuckets';

export {
  bucketKey,
  bucketLabel,
  isoWeek,
  presetRange,
  ymd,
  type Bucket,
  type DateRange,
  type Granularity,
  type RangePreset,
} from './timeBuckets';

/** Cuenta las PRs mergeadas por cubo dentro del rango (ver `bucketItems`). */
export function bucketMerged(
  prs: ReadonlyArray<{ merged: string | null }>,
  g: Granularity,
  range: DateRange,
): Bucket[] {
  return bucketItems(prs, (p) => p.merged, g, range);
}
