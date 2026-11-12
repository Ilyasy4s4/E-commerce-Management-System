import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'E-commerce Management System API berjalan';
  }
}
