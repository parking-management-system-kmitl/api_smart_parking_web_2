import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
    process.env.TZ = 'UTC';

    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
    app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/public/' });

    // รวมการตั้งค่า CORS ทั้งหมดไว้ในครั้งเดียว
    app.enableCors({
        origin: [
            'http://localhost:3000',
            'https://pms-frontend-murex.vercel.app',
            'http://jjsornwakii.3bbddns.com:34721',
            'http://ce67-31.cloud.ce.kmitl.ac.th',
        ],
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
    });

    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();