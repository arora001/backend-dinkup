import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  const rawOrigins = process.env.CORS_ORIGIN;
  const corsOrigin =
    rawOrigins && rawOrigins !== '*'
      ? rawOrigins.split(',').map((o) => o.trim())
      : true;

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'x-razorpay-signature',
    ],
  });

  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('DinkUp API')
    .setDescription(
      'Pickleball court booking and open games for Chandigarh tricity',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 5003;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 DinkUp API running on http://0.0.0.0:${port}/api/v1`);
  console.log(`📚 Swagger docs available at http://0.0.0.0:${port}/api/docs`);
  console.log(`💓 Health check active at http://0.0.0.0:${port}/health`);
}
void bootstrap();
