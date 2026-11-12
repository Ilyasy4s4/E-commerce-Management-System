import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

// Semua field opsional, jadi boleh mengubah sebagian data saja
export class UpdateProductDto {
  @IsOptional()
  @IsNotEmpty({ message: 'Nama produk tidak boleh kosong' })
  @IsString({ message: 'Nama produk harus berupa teks' })
  @MaxLength(150, { message: 'Nama produk maksimal 150 karakter' })
  readonly name?: string;

  @IsOptional()
  @IsNotEmpty({ message: 'SKU tidak boleh kosong' })
  @IsString({ message: 'SKU harus berupa teks' })
  @MaxLength(50, { message: 'SKU maksimal 50 karakter' })
  readonly sku?: string;

  @IsOptional()
  @IsString({ message: 'Deskripsi harus berupa teks' })
  readonly description?: string;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Harga harus berupa angka (maks. 2 desimal)' },
  )
  @Min(0, { message: 'Harga tidak boleh negatif' })
  readonly price?: number;

  @IsOptional()
  @IsInt({ message: 'Stok harus berupa angka bulat' })
  @Min(0, { message: 'Stok tidak boleh negatif' })
  readonly stock?: number;

  @IsOptional()
  @IsBoolean({ message: 'Status aktif harus berupa boolean' })
  readonly isActive?: boolean;

  // Kirim null untuk melepas kategori
  @IsOptional()
  @IsUUID('4', { message: 'categoryId harus berupa UUID' })
  readonly categoryId?: string | null;
}
