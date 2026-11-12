import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { definedOnly } from '../common/utils/defined-only.js';
import { Category } from './entities/category.entity.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly repository: Repository<Category>,
  ) {}

  async findAll(): Promise<Category[]> {
    return this.repository.find({ order: { name: 'ASC' } });
  }

  // Detail kategori ikut menampilkan daftar produk di dalamnya
  async findOne(id: string): Promise<Category> {
    const item = await this.repository.findOne({
      where: { id },
      relations: { products: true },
    });

    if (!item) {
      throw new NotFoundException(`Kategori dengan id ${id} tidak ditemukan`);
    }

    return item;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    await this.ensureNameAvailable(dto.name);

    const item = this.repository.create(dto);
    const saved = await this.repository.save(item);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const item = await this.findOne(id);

    if (dto.name && dto.name !== item.name) {
      await this.ensureNameAvailable(dto.name);
    }

    Object.assign(item, definedOnly(dto));
    await this.repository.save(item);
    return this.findOne(id);
  }

  // Produk yang memakai kategori ini tidak ikut terhapus (category_id jadi NULL)
  async remove(id: string): Promise<void> {
    const item = await this.findOne(id);
    await this.repository.remove(item);
  }

  private async ensureNameAvailable(name: string): Promise<void> {
    const exists = await this.repository.exists({ where: { name } });

    if (exists) {
      throw new ConflictException('Kategori dengan nama tersebut sudah ada');
    }
  }
}
