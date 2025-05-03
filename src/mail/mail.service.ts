import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendConfirmationEmail(email: string, teamName: string, token: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Confirma tu participación en el equipo',
      html: `
        <h1>¡Bienvenido al equipo ${teamName}!</h1>
        <p>Por favor confirma tu participación:</p>
        <a href="http://tusitio.com/confirmar?token=${token}">CONFIRMAR</a>
      `,
    });
  }
}