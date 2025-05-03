import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'path';

import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JurorModule } from './juror/juror.module';
import { SubjectsModule } from './subjects/subjects.module';
import { NrcsModule } from './nrcs/nrcs.module';
import { APP_GUARD } from '@nestjs/core';
import { SupabaseAuthGuard } from './auth/guards/supabase-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    SubjectsModule,
    NrcsModule,
    JurorModule,

    // Añadimos MailerModule configurado con SMTP
    MailerModule.forRoot({
      transport: {
        host: 'smtp.gmail.com', 
        port: 465,
        secure: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      },
      defaults: {
        from: '"GamerLab" <pruebaslabgamer@gmail.com>', 
      },
      template: {
        dir: join(__dirname, 'templates'),
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: SupabaseAuthGuard }],
})
export class AppModule {}

