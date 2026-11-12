import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Semua field opsional, jadi boleh mengubah sebagian data saja
export class UpdateCategoryDto {
  @IsOptional()
  @IsNotEmpty({ message: 'Nama tidak boleh kosong' })
  @IsString({ message: 'Nama harus berupa teks' })
  @MaxLength(100, { message: 'Maksimal 100 karakter' })
  readonly name?: string;

  @IsOptional()
  @IsString({ message: 'Deskripsi harus berupa teks' })
  readonly description?: string;
}
