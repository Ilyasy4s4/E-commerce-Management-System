import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';

import { Order } from './order.entity.js';
import { Product } from '../../products/entities/product.entity.js';
import { decimalTransformer } from '../../common/transformers/decimal.transformer.js';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Pesanan dihapus -> detail itemnya ikut terhapus
  @ManyToOne(() => Order, (order) => order.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'order_id' })
  order: Relation<Order>;

  // Produk yang sudah pernah dipesan tidak boleh dihapus permanen
  @ManyToOne(() => Product, (product) => product.orderItems, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'product_id' })
  product: Relation<Product>;

  @Column({ type: 'int' })
  quantity: number;

  // Snapshot harga satuan saat transaksi (bukan harga katalog sekarang),
  // supaya riwayat pesanan tetap benar walaupun harga produk berubah
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  price: number;

  // quantity x price
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  subtotal: number;
}
