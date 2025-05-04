import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        service: 'Gmail',
        auth: {
          user: 'tuemail@gmail.com',
          pass: 'tucontraseña',
        },
      },
    }),
  ],
  exports: [MailerModule],
})
export class MailModule {}