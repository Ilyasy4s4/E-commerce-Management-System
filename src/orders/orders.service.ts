import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  Repository,
} from 'typeorm';

import { Customer } from '../customers/entities/customer.entity.js';
import { Product } from '../products/entities/product.entity.js';
import {
  Order,
  ORDER_STATUS_TRANSITIONS,
} from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { CreateOrderDto, OrderItemInputDto } from './dto/create-order.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { FindOrdersQueryDto } from './dto/find-orders-query.dto.js';

// Relasi yang ikut ditampilkan di response pesanan:
// pelanggan + setiap item beserta informasi produk (dan kategorinya)
const ORDER_RELATIONS = {
  customer: true,
  items: { product: { category: true } },
} as const;

// Hasil perhitungan satu baris item (sebelum disimpan)
interface OrderLine {
  product: Product;
  quantity: number;
  price: number; // snapshot harga saat transaksi
  subtotal: number;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly dataSource: DataSource,
  ) {}

  // Menampilkan semua pesanan (bisa difilter per pelanggan / status).
  // withDeleted: pesanan lama tetap tampil walau produk/pelanggannya sudah di-soft delete.
  async findAll(query: FindOrdersQueryDto): Promise<Order[]> {
    const where: FindOptionsWhere<Order> = {};

    if (query.customerId) {
      where.customer = { id: query.customerId };
    }
    if (query.status) {
      where.status = query.status;
    }

    return this.orderRepository.find({
      where,
      relations: ORDER_RELATIONS,
      order: { createdAt: 'DESC' },
      withDeleted: true,
    });
  }

  // Detail pesanan beserta item dan informasi produk terkait
  async findOne(id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ORDER_RELATIONS,
      withDeleted: true,
    });

    if (!order) {
      throw new NotFoundException(`Pesanan dengan id ${id} tidak ditemukan`);
    }

    return order;
  }

  // Membuat pesanan baru. Semua langkah berjalan dalam satu transaksi:
  // jika ada yang gagal (mis. stok kurang) tidak ada data yang tersimpan.
  async create(dto: CreateOrderDto): Promise<Order> {
    const orderId = await this.dataSource.transaction(async (manager) => {
      const customer = await manager.findOne(Customer, {
        where: { id: dto.customerId },
      });

      if (!customer) {
        throw new NotFoundException(
          `Pelanggan dengan id ${dto.customerId} tidak ditemukan`,
        );
      }

      const lines = await this.reserveStock(manager, dto.items);

      const order = await manager.save(
        manager.create(Order, {
          customer,
          orderNumber: this.generateOrderNumber(),
          status: 'pending',
          shippingAddress: dto.shippingAddress ?? customer.address,
          totalAmount: this.sumTotal(lines),
        }),
      );

      await this.saveItems(manager, order, lines);

      return order.id;
    });

    return this.findOne(orderId);
  }

  // Memperbarui pesanan: ganti item, ubah alamat kirim, atau pindah status.
  async update(id: string, dto: UpdateOrderDto): Promise<Order> {
    if (dto.items !== undefined && dto.status !== undefined) {
      throw new BadRequestException(
        'Item dan status tidak dapat diubah dalam satu permintaan',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, id);

      if (
        ORDER_STATUS_TRANSITIONS[order.status].length === 0 &&
        Object.keys(dto).length > 0
      ) {
        throw new ConflictException(
          `Pesanan berstatus ${order.status} tidak dapat diubah lagi`,
        );
      }

      // 1) Ganti seluruh item (hanya saat pending)
      if (dto.items !== undefined) {
        if (order.status !== 'pending') {
          throw new ConflictException(
            'Item hanya dapat diubah saat status pesanan masih pending',
          );
        }

        // kembalikan stok item lama, hapus, lalu pesan ulang dengan item baru
        const oldItems = await this.loadItems(manager, order.id);
        await this.restoreStock(manager, oldItems);
        await manager.remove(OrderItem, oldItems);

        const lines = await this.reserveStock(manager, dto.items);
        await this.saveItems(manager, order, lines);
        order.totalAmount = this.sumTotal(lines);
      }

      // 2) Ubah alamat kirim (hanya sebelum barang dikirim)
      if (dto.shippingAddress !== undefined) {
        if (order.status !== 'pending' && order.status !== 'paid') {
          throw new ConflictException(
            'Alamat kirim hanya dapat diubah sebelum pesanan dikirim',
          );
        }
        order.shippingAddress = dto.shippingAddress;
      }

      // 3) Pindah status sesuai alur yang diperbolehkan
      if (dto.status !== undefined && dto.status !== order.status) {
        const allowed = ORDER_STATUS_TRANSITIONS[order.status];

        if (!allowed.includes(dto.status)) {
          throw new ConflictException(
            `Status tidak dapat diubah dari ${order.status} ke ${dto.status}` +
              ` (yang diperbolehkan: ${allowed.join(', ')})`,
          );
        }

        // Pesanan dibatalkan -> stok dikembalikan
        if (dto.status === 'cancelled') {
          const items = await this.loadItems(manager, order.id);
          await this.restoreStock(manager, items);
        }

        order.status = dto.status;
      }

      await manager.save(order);
    });

    return this.findOne(id);
  }

  // Menghapus pesanan. Hanya pesanan pending / cancelled yang boleh dihapus;
  // pesanan yang sudah dibayar/dikirim/selesai adalah catatan transaksi.
  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, id);

      if (order.status !== 'pending' && order.status !== 'cancelled') {
        throw new ConflictException(
          'Hanya pesanan berstatus pending atau cancelled yang dapat dihapus',
        );
      }

      // Pesanan pending masih menahan stok -> kembalikan dulu
      if (order.status === 'pending') {
        const items = await this.loadItems(manager, order.id);
        await this.restoreStock(manager, items);
      }

      // order_items ikut terhapus (ON DELETE CASCADE)
      await manager.remove(order);
    });
  }

  // ---------------------------------------------------------------
  // Helper internal
  // ---------------------------------------------------------------

  // Ambil pesanan dengan row lock agar tidak diubah dua request sekaligus
  private async lockOrder(manager: EntityManager, id: string): Promise<Order> {
    const order = await manager.findOne(Order, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });

    if (!order) {
      throw new NotFoundException(`Pesanan dengan id ${id} tidak ditemukan`);
    }

    return order;
  }

  private loadItems(
    manager: EntityManager,
    orderId: string,
  ): Promise<OrderItem[]> {
    return manager.find(OrderItem, {
      where: { order: { id: orderId } },
      relations: { product: true },
      withDeleted: true,
    });
  }

  // Validasi item, kunci baris produk, cek stok, lalu kurangi stok.
  // Harga diambil dari database (bukan dari client) sebagai snapshot.
  private async reserveStock(
    manager: EntityManager,
    items: OrderItemInputDto[],
  ): Promise<OrderLine[]> {
    const ids = items.map((item) => item.productId);

    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Produk yang sama tidak boleh muncul dua kali, gabungkan kuantitasnya',
      );
    }

    // Diurutkan berdasarkan id agar dua transaksi tidak saling menunggu (deadlock)
    const products = await manager.find(Product, {
      where: { id: In(ids) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const lines: OrderLine[] = [];

    for (const item of items) {
      const product = productById.get(item.productId);

      if (!product) {
        throw new NotFoundException(
          `Produk dengan id ${item.productId} tidak ditemukan`,
        );
      }
      if (!product.isActive) {
        throw new BadRequestException(
          `Produk "${product.name}" sedang tidak tersedia`,
        );
      }
      if (product.stock < item.quantity) {
        throw new ConflictException(
          `Stok produk "${product.name}" tidak cukup ` +
            `(tersedia ${product.stock}, diminta ${item.quantity})`,
        );
      }

      // Hitung dalam sen supaya tidak kena masalah pembulatan desimal
      const subtotalCents = Math.round(product.price * 100) * item.quantity;

      lines.push({
        product,
        quantity: item.quantity,
        price: product.price,
        subtotal: subtotalCents / 100,
      });
    }

    for (const line of lines) {
      await manager.decrement(
        Product,
        { id: line.product.id },
        'stock',
        line.quantity,
      );
    }

    return lines;
  }

  // Kembalikan stok dari item-item pesanan (saat dibatalkan / dihapus / item diganti)
  private async restoreStock(
    manager: EntityManager,
    items: OrderItem[],
  ): Promise<void> {
    const sorted = [...items].sort((a, b) =>
      a.product.id.localeCompare(b.product.id),
    );

    for (const item of sorted) {
      await manager.increment(
        Product,
        { id: item.product.id },
        'stock',
        item.quantity,
      );
    }
  }

  private async saveItems(
    manager: EntityManager,
    order: Order,
    lines: OrderLine[],
  ): Promise<void> {
    await manager.save(
      OrderItem,
      lines.map((line) =>
        manager.create(OrderItem, {
          order,
          product: line.product,
          quantity: line.quantity,
          price: line.price,
          subtotal: line.subtotal,
        }),
      ),
    );
  }

  private sumTotal(lines: OrderLine[]): number {
    const cents = lines.reduce(
      (total, line) => total + Math.round(line.subtotal * 100),
      0,
    );
    return cents / 100;
  }

  // Contoh: ORD-20261112-A1B2C3D4
  private generateOrderNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const random = randomBytes(4).toString('hex').toUpperCase();
    return `ORD-${date}-${random}`;
  }
}
