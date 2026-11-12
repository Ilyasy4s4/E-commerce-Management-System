import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';

import { definedOnly } from '../common/utils/defined-only.js';
import { Product } from './entities/product.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { FindProductsQueryDto } from './dto/find-products-query.dto.js';

// Relasi yang ikut ditampilkan di setiap response produk
const PRODUCT_RELATIONS = { category: true } as const;

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  // Menampilkan semua produk (bisa difilter per kategori / dicari berdasarkan nama)
  async findAll(query: FindProductsQueryDto): Promise<Product[]> {
    const where: FindOptionsWhere<Product> = {};

    if (query.categoryId) {
      where.category = { id: query.categoryId };
    }
    if (query.search) {
      where.name = ILike(`%${query.search}%`);
    }

    return this.productRepository.find({
      where,
      relations: PRODUCT_RELATIONS,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: PRODUCT_RELATIONS,
    });

    if (!product) {
      throw new NotFoundException(`Produk dengan id ${id} tidak ditemukan`);
    }

    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const { categoryId, ...fields } = dto;

    await this.ensureSkuAvailable(fields.sku);
    const relations = await this.resolveCategory(categoryId);

    const product = this.productRepository.create({
      ...fields,
      ...relations,
    });

    const saved = await this.productRepository.save(product);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    const { categoryId, ...fields } = dto;

    if (fields.sku && fields.sku !== product.sku) {
      await this.ensureSkuAvailable(fields.sku);
    }

    const relations = await this.resolveCategory(categoryId);

    Object.assign(product, definedOnly(fields), relations);
    await this.productRepository.save(product);

    return this.findOne(id);
  }

  // Soft delete: riwayat pesanan yang memuat produk ini tetap utuh
  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    await this.productRepository.softRemove(product);
  }

  // SKU harus unik (termasuk produk yang sudah di-soft delete)
  private async ensureSkuAvailable(sku: string): Promise<void> {
    const exists = await this.productRepository.exists({
      where: { sku },
      withDeleted: true,
    });

    if (exists) {
      throw new ConflictException('SKU sudah terdaftar');
    }
  }

  // Mengubah categoryId menjadi data relasinya.
  // undefined = tidak diubah, null = lepas kategori.
  private async resolveCategory(
    categoryId?: string | null,
  ): Promise<{ category?: Category | null }> {
    if (categoryId === undefined) {
      return {};
    }
    if (categoryId === null) {
      return { category: null };
    }

    const category = await this.categoryRepository.findOneBy({
      id: categoryId,
    });

    if (!category) {
      throw new NotFoundException(
        `Kategori dengan id ${categoryId} tidak ditemukan`,
      );
    }

    return { category };
  }
}
