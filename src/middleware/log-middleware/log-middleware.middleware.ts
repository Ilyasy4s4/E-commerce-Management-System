
import {
  Injectable,
  NestMiddleware,
  Logger,
} from '@nestjs/common';

import {
  Request,
  Response,
  NextFunction,
} from 'express';

@Injectable()
export class LogMiddlewareMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || 'tidak diketahui';
    const startTime = Date.now();

    // Dijalankan ketika response selesai dikirim
    res.on('finish', () => {
      // Mengambil status HTTP dari response
      const statusCode = res.statusCode;

      // Menghitung durasi request
      const duration = Date.now() - startTime;

      // Membuat pesan log
      const logMessage = [
        `${method} ${originalUrl}`,
        `Status: ${statusCode}`,
        `Durasi: ${duration}ms`,
        `IP Address: ${ip}`,
        `Agent: ${userAgent}`,
      ]

      // Menampilkan log di terminal
      if (statusCode >= 500) {
        this.logger.error(logMessage);
      } else if (statusCode >= 400) {
        this.logger.warn(logMessage);
      } else {
        this.logger.log(logMessage);
      }
    });

    // Melanjutkan request ke proses berikutnya
    next();
  }
}
