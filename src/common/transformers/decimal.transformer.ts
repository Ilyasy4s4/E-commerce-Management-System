import type { ValueTransformer } from 'typeorm';

// Postgres mengembalikan kolom DECIMAL sebagai string ("150000.00").
// Transformer ini mengubahnya menjadi number di sisi aplikasi.
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? value : parseFloat(value),
};
