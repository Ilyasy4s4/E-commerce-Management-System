import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { definedOnly } from '../common/utils/defined-only.js';
import { Customer } from './entities/customer.entity.js';
import {
  Order,
  ACTIVE_ORDER_STATUSES,
} from '../orders/entities/order.entity.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  // Ambil semua pelanggan (yang belum di-soft delete)
  async findAll(): Promise<Customer[]> {
    return this.customerRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  // Ambil satu pelanggan beserta riwayat pesanannya
  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { id },
      relations: { orders: true },
      order: { orders: { createdAt: 'DESC' } },
    });

    if (!customer) {
      throw new NotFoundException(`Pelanggan dengan id ${id} tidak ditemukan`);
    }

    return customer;
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    await this.ensureEmailAvailable(dto.email);

    const customer = this.customerRepository.create(dto);
    const saved = await this.customerRepository.save(customer);

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.findOne(id);

    if (dto.email && dto.email !== customer.email) {
      await this.ensureEmailAvailable(dto.email);
    }

    Object.assign(customer, definedOnly(dto));
    await this.customerRepository.save(customer);

    return this.findOne(id);
  }

  // Soft delete: data tidak hilang, hanya diisi deleted_at.
  // Aturan bisnis: pelanggan yang masih punya pesanan aktif tidak boleh dihapus.
  async remove(id: string): Promise<void> {
    const customer = await this.findOne(id);

    const hasActiveOrders = await this.orderRepository.exists({
      where: {
        customer: { id },
        status: In([...ACTIVE_ORDER_STATUSES]),
      },
    });

    if (hasActiveOrders) {
      throw new ConflictException(
        'Pelanggan masih memiliki pesanan yang sedang berjalan, tidak dapat dihapus',
      );
    }

    await this.customerRepository.softRemove(customer);
  }

  private async ensureEmailAvailable(email: string): Promise<void> {
    const exists = await this.customerRepository.exists({
      where: { email },
      withDeleted: true,
    });

    if (exists) {
      throw new ConflictException('Email sudah terdaftar');
    }
  }
}
