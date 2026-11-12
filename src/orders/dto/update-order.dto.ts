import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { ORDER_STATUSES, type OrderStatus } from '../entities/order.entity.js';
import { OrderItemInputDto } from './create-order.dto.js';

// Semua field opsional. Aturan bisnis ada di OrdersService:
// - items hanya boleh diubah saat status masih pending
// - items dan status tidak boleh diubah dalam satu permintaan
export class UpdateOrderDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES, {
    message: `Status harus salah satu dari: ${ORDER_STATUSES.join(', ')}`,
  })
  readonly status?: OrderStatus;

  @IsOptional()
  @IsNotEmpty({ message: 'Alamat kirim tidak boleh kosong' })
  @IsString({ message: 'Alamat kirim harus berupa teks' })
  readonly shippingAddress?: string;

  // Mengganti seluruh daftar item pesanan
  @IsOptional()
  @IsArray({ message: 'items harus berupa array' })
  @ArrayMinSize(1, { message: 'Pesanan minimal memiliki 1 item' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  readonly items?: OrderItemInputDto[];
}
