import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health')
@Controller()
export class HealthController {
  @Get('health')
  @ApiOperation({
    summary: 'Service health check and keep-alive ping endpoint',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy and ready to accept traffic',
  })
  getHealth() {
    return {
      status: 'ok',
      service: 'backend-dinkup',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }
}
