import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { ORDER_STATUSES, type OrderStatus } from '../entities/order.entity.js';

// Query string untuk GET /orders?customerId=...&status=...
export class FindOrdersQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'customerId harus berupa UUID' })
  readonly customerId?: string;

  @IsOptional()
  @IsIn(ORDER_STATUSES, {
    message: `Status harus salah satu dari: ${ORDER_STATUSES.join(', ')}`,
  })
  readonly status?: OrderStatus;
}
