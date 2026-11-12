import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

// Satu baris item dalam pesanan
export class OrderItemInputDto {
  @IsUUID('4', { message: 'productId harus berupa UUID' })
  readonly productId: string;

  @IsInt({ message: 'Kuantitas harus berupa angka bulat' })
  @Min(1, { message: 'Kuantitas minimal 1' })
  readonly quantity: number;
}

export class CreateOrderDto {
  @IsUUID('4', { message: 'customerId harus berupa UUID' })
  readonly customerId: string;

  // Jika tidak diisi, dipakai alamat pelanggan
  @IsOptional()
  @IsNotEmpty({ message: 'Alamat kirim tidak boleh kosong' })
  @IsString({ message: 'Alamat kirim harus berupa teks' })
  readonly shippingAddress?: string;

  @IsArray({ message: 'items harus berupa array' })
  @ArrayMinSize(1, { message: 'Pesanan minimal memiliki 1 item' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  readonly items: OrderItemInputDto[];
}
