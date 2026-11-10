import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ExcelExportService } from '../professors/excel-export.service';

export interface CertificateDownload {
  pdf: Buffer;
  fileName: string;
}

/** ARK-170 (TA-19): responde un certificado como archivo PDF descargable. */
export function sendCertificatePdf(
  res: Response,
  { pdf, fileName }: CertificateDownload,
): StreamableFile {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    ExcelExportService.buildContentDisposition(fileName),
  );
  return new StreamableFile(pdf);
}
