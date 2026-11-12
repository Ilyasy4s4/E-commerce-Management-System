import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  type Relation,
} from 'typeorm';

import { Customer } from '../../customers/entities/customer.entity.js';
import { OrderItem } from './order-item.entity.js';
import { decimalTransformer } from '../../common/transformers/decimal.transformer.js';

// Daftar status pesanan
export const ORDER_STATUSES = [
  'pending',
  'paid',
  'shipped',
  'completed',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Pesanan yang masih berjalan (belum selesai / dibatalkan)
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'paid',
  'shipped',
];

// Aturan perpindahan status yang diperbolehkan:
// pending -> paid -> shipped -> completed, dan dibatalkan sebelum dikirim
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['completed'],
  completed: [],
  cancelled: [],
};

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Satu pelanggan dapat memiliki banyak pesanan
  @ManyToOne(() => Customer, (customer) => customer.orders, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'customer_id' })
  customer: Relation<Customer>;

  @Column({ name: 'order_number', type: 'varchar', length: 50, unique: true })
  orderNumber: string;

  @Column({ type: 'varchar', length: 30, default: 'pending' })
  status: OrderStatus;

  // Snapshot alamat kirim saat pesanan dibuat (tidak ikut berubah
  // kalau pelanggan mengganti alamat di kemudian hari)
  @Column({ name: 'shipping_address', type: 'text' })
  shippingAddress: string;

  // Total seluruh subtotal item, dihitung server
  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalAmount: number;

  // Satu pesanan dapat memiliki banyak detail item
  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
