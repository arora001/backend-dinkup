import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KeepAliveService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(KeepAliveService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly config: ConfigService) {}

  onApplicationBootstrap() {
    const externalUrl =
      this.config.get<string>('RENDER_EXTERNAL_URL') ||
      this.config.get<string>('APP_URL');

    if (!externalUrl) {
      this.logger.log(
        'KeepAliveService idle: RENDER_EXTERNAL_URL or APP_URL not set (local dev mode)',
      );
      return;
    }

    // Default: 14 minutes (Render sleeps at 15 minutes of inactivity)
    const intervalMinutes =
      Number(this.config.get<number>('KEEP_ALIVE_INTERVAL_MINUTES')) || 14;
    const intervalMs = intervalMinutes * 60 * 1000;
    const targetUrl = `${externalUrl.replace(/\/+$/, '')}/health`;

    this.logger.log(
      `KeepAliveService active: Pinging ${targetUrl} every ${intervalMinutes} minutes to prevent sleep`,
    );

    // Initial ping after 45 seconds to verify self-reachability
    setTimeout(() => {
      void this.ping(targetUrl);
    }, 45 * 1000);

    // Recurring keep-alive ping
    this.timer = setInterval(() => {
      void this.ping(targetUrl);
    }, intervalMs);
  }

  private async ping(targetUrl: string) {
    try {
      const start = Date.now();
      const res = await fetch(targetUrl, {
        headers: { 'User-Agent': 'DinkUp-KeepAlive-Worker/1.0' },
      });
      const duration = Date.now() - start;

      if (res.ok) {
        this.logger.log(
          `✓ Keep-alive ping succeeded (${res.status} OK in ${duration}ms)`,
        );
      } else {
        this.logger.warn(
          `⚠ Keep-alive ping returned status ${res.status} in ${duration}ms`,
        );
      }
    } catch (err: any) {
      this.logger.error(`✗ Keep-alive ping failed: ${err.message}`);
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
