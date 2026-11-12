import { IsOptional, IsString, IsUUID } from 'class-validator';

// Query string untuk GET /products?categoryId=...&search=...
export class FindProductsQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'categoryId harus berupa UUID' })
  readonly categoryId?: string;

  @IsOptional()
  @IsString({ message: 'search harus berupa teks' })
  readonly search?: string;
}
