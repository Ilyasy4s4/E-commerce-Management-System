import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';

import { AppModule } from '../src/app.module.js';
import { TransformResponseInterceptor } from '../src/interceptors/transform-response/transform-response.interceptor.js';

// Catatan: tes ini memakai database sungguhan dari file .env
// (data tes diberi suffix unik supaya tidak bentrok dengan data lain).
describe('E-commerce API (e2e)', () => {
  let app: INestApplication<Server>;

  const suffix = Date.now().toString();

  // helper kecil agar tes lebih ringkas
  const post = (url: string, body: object) => request(app.getHttpServer()).post(url).send(body);
  const put = (url: string, body: object) => request(app.getHttpServer()).put(url).send(body);
  const get = (url: string) => request(app.getHttpServer()).get(url);
  const del = (url: string) => request(app.getHttpServer()).delete(url);

  let categoryId: string;
  let customerId: string;
  let productId: string;
  let product2Id: string;

  const stockOf = async (id: string): Promise<number> =>
    (await get(`/products/${id}`)).body.data.stock;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new TransformResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Categories, Products, Customers', () => {
    it('membuat kategori & menolak nama kembar', async () => {
      const res = await post('/categories', { name: `Elektronik ${suffix}` }).expect(201);
      categoryId = res.body.data.id;
      expect(res.body.success).toBe(true);

      await post('/categories', { name: `Elektronik ${suffix}` }).expect(409);
    });

    it('membuat produk dengan relasi kategori', async () => {
      const res = await post('/products', {
        name: 'Keyboard Mekanik',
        sku: `KB-${suffix}`,
        price: 150000.5,
        stock: 10,
        categoryId,
      }).expect(201);

      productId = res.body.data.id;
      expect(res.body.data.price).toBe(150000.5); // number, bukan string
      expect(res.body.data.category.id).toBe(categoryId);

      const res2 = await post('/products', {
        name: 'Mouse',
        sku: `MS-${suffix}`,
        price: 75000,
        stock: 5,
        categoryId,
      }).expect(201);
      product2Id = res2.body.data.id;
    });

    it('validasi produk: harga negatif, SKU kembar, kategori tidak ada', async () => {
      await post('/products', { name: 'X', sku: `X-${suffix}`, price: -1 }).expect(400);
      await post('/products', { name: 'Dup', sku: `KB-${suffix}`, price: 1 }).expect(409);
      await post('/products', {
        name: 'Y',
        sku: `Y-${suffix}`,
        price: 1,
        categoryId: '11111111-1111-4111-8111-111111111111',
      }).expect(404);
    });

    it('detail kategori menampilkan produknya; filter produk per kategori', async () => {
      const cat = await get(`/categories/${categoryId}`).expect(200);
      expect(cat.body.data.products).toHaveLength(2);

      const list = await get(`/products?categoryId=${categoryId}`).expect(200);
      expect(list.body.data).toHaveLength(2);
    });

    it('membuat pelanggan & menolak email kembar', async () => {
      const res = await post('/customers', {
        name: 'Budi',
        email: `budi-${suffix}@mail.com`,
        phone: '08123456789',
        address: 'Jl. Merdeka No. 1, Indramayu',
      }).expect(201);
      customerId = res.body.data.id;

      await post('/customers', {
        name: 'Budi 2',
        email: `budi-${suffix}@mail.com`,
        phone: '0811',
        address: 'x',
      }).expect(409);
    });
  });

  describe('Orders', () => {
    let orderId: string;

    it('membuat pesanan: total dihitung server, harga di-snapshot, stok berkurang', async () => {
      const res = await post('/orders', {
        customerId,
        items: [
          { productId, quantity: 3 },
          { productId: product2Id, quantity: 2 },
        ],
      }).expect(201);

      const order = res.body.data;
      orderId = order.id;

      expect(order.status).toBe('pending');
      expect(order.orderNumber).toMatch(/^ORD-\d{8}-[0-9A-F]{8}$/);
      expect(order.shippingAddress).toBe('Jl. Merdeka No. 1, Indramayu'); // default dari pelanggan
      expect(order.totalAmount).toBe(150000.5 * 3 + 75000 * 2);
      expect(order.items).toHaveLength(2);

      const kb = order.items.find((i: any) => i.product.id === productId);
      expect(kb.quantity).toBe(3);
      expect(kb.price).toBe(150000.5);
      expect(kb.subtotal).toBe(450001.5);

      expect(await stockOf(productId)).toBe(7);
      expect(await stockOf(product2Id)).toBe(3);
    });

    it('detail pesanan memuat info produk, kategori, dan pelanggan', async () => {
      const res = await get(`/orders/${orderId}`).expect(200);
      const item = res.body.data.items[0];

      expect(res.body.data.customer.id).toBe(customerId);
      expect(item.product.name).toBeDefined();
      expect(item.product.sku).toBeDefined();
      expect(item.product.category.name).toBe(`Elektronik ${suffix}`);
    });

    it('harga item tidak berubah walau harga produk diubah (snapshot)', async () => {
      await put(`/products/${productId}`, { price: 999999 }).expect(200);
      const res = await get(`/orders/${orderId}`).expect(200);
      // kembalikan harga dulu sebelum assertion, agar tes lain tidak terpengaruh
      await put(`/products/${productId}`, { price: 150000.5 }).expect(200);

      const kb = res.body.data.items.find((i: any) => i.product.id === productId);
      expect(kb.price).toBe(150000.5); // harga saat transaksi
      expect(kb.product.price).toBe(999999); // harga katalog saat ini
      expect(res.body.data.totalAmount).toBe(600001.5); // 3 x 150000.5 + 2 x 75000
    });

    it('menolak input tidak valid', async () => {
      await post('/orders', { customerId, items: [] }).expect(400);
      await post('/orders', { customerId, items: [{ productId, quantity: 0 }] }).expect(400);
      await post('/orders', { customerId, items: [{ productId: 'abc', quantity: 1 }] }).expect(400);
      await post('/orders', { customerId, items: [{ productId, quantity: 1 }], total: 1 }).expect(400); // field asing
      await post('/orders', {
        customerId,
        items: [{ productId, quantity: 1 }, { productId, quantity: 1 }],
      }).expect(400); // produk dobel
    });

    it('menolak pelanggan / produk yang tidak ada', async () => {
      const ghost = '11111111-1111-4111-8111-111111111111';
      await post('/orders', { customerId: ghost, items: [{ productId, quantity: 1 }] }).expect(404);
      await post('/orders', { customerId, items: [{ productId: ghost, quantity: 1 }] }).expect(404);
    });

    it('menolak pesanan jika stok tidak cukup & tidak ada yang tersimpan (rollback)', async () => {
      const before = await stockOf(product2Id);

      const res = await post('/orders', {
        customerId,
        items: [
          { productId, quantity: 1 },
          { productId: product2Id, quantity: before + 1 },
        ],
      }).expect(409);
      expect(res.body.message).toContain('Stok');

      // produk pertama tidak ikut berkurang
      expect(await stockOf(productId)).toBe(7);
      expect(await stockOf(product2Id)).toBe(before);
    });

    it('menolak produk nonaktif', async () => {
      const p = await post('/products', {
        name: 'Nonaktif',
        sku: `NA-${suffix}`,
        price: 1000,
        stock: 5,
        isActive: false,
      }).expect(201);

      await post('/orders', {
        customerId,
        items: [{ productId: p.body.data.id, quantity: 1 }],
      }).expect(400);
    });

    it('mengganti item saat pending: stok lama dikembalikan, stok baru dikurangi', async () => {
      const res = await put(`/orders/${orderId}`, {
        items: [{ productId, quantity: 5 }],
      }).expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.totalAmount).toBe(750002.5);
      expect(await stockOf(productId)).toBe(5); // 10 - 5
      expect(await stockOf(product2Id)).toBe(5); // dikembalikan penuh
    });

    it('item & status tidak boleh diubah bersamaan', async () => {
      await put(`/orders/${orderId}`, {
        status: 'paid',
        items: [{ productId, quantity: 1 }],
      }).expect(400);
    });

    it('alur status: pending -> shipped ditolak, pending -> paid diterima', async () => {
      await put(`/orders/${orderId}`, { status: 'shipped' }).expect(409);
      await put(`/orders/${orderId}`, { status: 'selesai' }).expect(400);

      const res = await put(`/orders/${orderId}`, { status: 'paid' }).expect(200);
      expect(res.body.data.status).toBe('paid');
    });

    it('setelah paid: item tidak bisa diganti & pesanan tidak bisa dihapus', async () => {
      await put(`/orders/${orderId}`, { items: [{ productId, quantity: 1 }] }).expect(409);
      await del(`/orders/${orderId}`).expect(409);
    });

    it('pelanggan dengan pesanan aktif tidak dapat dihapus', async () => {
      await del(`/customers/${customerId}`).expect(409);
    });

    it('membatalkan pesanan mengembalikan stok; status final tidak bisa diubah', async () => {
      await put(`/orders/${orderId}`, { status: 'cancelled' }).expect(200);
      expect(await stockOf(productId)).toBe(10);

      await put(`/orders/${orderId}`, { status: 'paid' }).expect(409);
      await put(`/orders/${orderId}`, { shippingAddress: 'baru' }).expect(409);
    });

    it('menghapus pesanan cancelled berhasil', async () => {
      await del(`/orders/${orderId}`).expect(200);
      await get(`/orders/${orderId}`).expect(404);
    });

    it('menghapus pesanan pending mengembalikan stok', async () => {
      const o = await post('/orders', { customerId, items: [{ productId, quantity: 4 }] }).expect(201);
      expect(await stockOf(productId)).toBe(6);

      await del(`/orders/${o.body.data.id}`).expect(200);
      expect(await stockOf(productId)).toBe(10);
    });

    it('alur penuh: pending -> paid -> shipped -> completed', async () => {
      const o = await post('/orders', {
        customerId,
        shippingAddress: 'Alamat kantor',
        items: [{ productId: product2Id, quantity: 1 }],
      }).expect(201);
      const id = o.body.data.id;
      expect(o.body.data.shippingAddress).toBe('Alamat kantor');

      await put(`/orders/${id}`, { status: 'paid' }).expect(200);
      await put(`/orders/${id}`, { shippingAddress: 'Alamat baru' }).expect(200);
      await put(`/orders/${id}`, { status: 'shipped' }).expect(200);
      await put(`/orders/${id}`, { shippingAddress: 'terlambat' }).expect(409);
      const done = await put(`/orders/${id}`, { status: 'completed' }).expect(200);
      expect(done.body.data.status).toBe('completed');
      expect(await stockOf(product2Id)).toBe(4); // tidak kembali karena selesai
    });

    it('filter pesanan per pelanggan & status', async () => {
      const res = await get(`/orders?customerId=${customerId}&status=completed`).expect(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('produk yang di-soft delete tetap tampil di riwayat pesanan', async () => {
      await del(`/products/${product2Id}`).expect(200);
      await get(`/products/${product2Id}`).expect(404);

      const list = await get(`/orders?customerId=${customerId}&status=completed`).expect(200);
      expect(list.body.data[0].items[0].product.id).toBe(product2Id);
    });

    it('dua pesanan bersamaan untuk stok terakhir: hanya satu yang berhasil', async () => {
      const p = await post('/products', {
        name: 'Barang Langka',
        sku: `RARE-${suffix}`,
        price: 50000,
        stock: 1,
      }).expect(201);

      const body = { customerId, items: [{ productId: p.body.data.id, quantity: 1 }] };
      const results = await Promise.all([
        post('/orders', body),
        post('/orders', body),
        post('/orders', body),
      ]);

      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409]);
      expect(await stockOf(p.body.data.id)).toBe(0);
    });

    it('pelanggan bisa dihapus setelah tidak ada pesanan aktif', async () => {
      // batalkan semua pesanan aktif milik pelanggan ini
      const active = await get(`/orders?customerId=${customerId}`).expect(200);
      for (const o of active.body.data) {
        if (o.status === 'pending') {
          await put(`/orders/${o.id}`, { status: 'cancelled' }).expect(200);
        }
      }

      await del(`/customers/${customerId}`).expect(200);
      await get(`/customers/${customerId}`).expect(404);
    });
  });
});
