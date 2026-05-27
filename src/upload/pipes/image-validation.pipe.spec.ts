import { BadRequestException } from '@nestjs/common';
import { ImageValidationPipe } from './image-validation.pipe';
import sizeOf from 'image-size';

// Mock image-size
jest.mock('image-size');
const mockedSizeOf = sizeOf as jest.Mock;

describe('ImageValidationPipe', () => {
  let pipe: ImageValidationPipe;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockFile = (size: number, originalname: string = 'test.jpg'): Express.Multer.File => ({
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size,
    buffer: Buffer.from('mock-buffer'),
    stream: null as any,
    destination: '',
    filename: originalname,
    path: '',
  });

  describe('Total Size Validation', () => {
    it('should pass if total size is within limit', () => {
      pipe = new ImageValidationPipe({ maxTotalSize: 1000 });
      mockedSizeOf.mockReturnValue({ width: 100, height: 100 });

      const files = [createMockFile(400), createMockFile(500)];
      expect(() => pipe.transform(files)).not.toThrow();
    });

    it('should throw BadRequestException if total size exceeds limit', () => {
      pipe = new ImageValidationPipe({ maxTotalSize: 1000 });
      mockedSizeOf.mockReturnValue({ width: 100, height: 100 });

      const files = [createMockFile(600), createMockFile(500)];
      expect(() => pipe.transform(files)).toThrow(BadRequestException);
      expect(() => pipe.transform(files)).toThrow(/El tamaño total de los archivos excede el límite permitido/);
    });
  });

  describe('Magic Bytes / Fake File Validation', () => {
    it('should throw BadRequestException if image-size fails (corrupt or fake file)', () => {
      pipe = new ImageValidationPipe({ minWidth: 10 });
      mockedSizeOf.mockImplementation(() => {
        throw new Error('invalid magic number');
      });

      const file = createMockFile(500, 'falso.jpg');
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(() => pipe.transform(file)).toThrow(/no es una imagen válida o está corrupto/);
    });

    it('should throw BadRequestException if image-size returns no dimensions', () => {
      pipe = new ImageValidationPipe({ minWidth: 10 });
      mockedSizeOf.mockReturnValue(undefined);

      const file = createMockFile(500);
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(() => pipe.transform(file)).toThrow(/No se pudieron determinar las dimensiones/);
    });
  });

  describe('Resolution Validation', () => {
    it('should pass if dimensions are within range', () => {
      pipe = new ImageValidationPipe({
        minWidth: 10,
        minHeight: 10,
        maxWidth: 6000,
        maxHeight: 6000,
      });
      mockedSizeOf.mockReturnValue({ width: 1000, height: 1000 });

      const file = createMockFile(500);
      expect(() => pipe.transform(file)).not.toThrow();
    });

    it('should throw if image is too small (width)', () => {
      pipe = new ImageValidationPipe({ minWidth: 10 });
      mockedSizeOf.mockReturnValue({ width: 5, height: 100 });

      const file = createMockFile(500);
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(() => pipe.transform(file)).toThrow(/Ancho mínimo: 10px, Ancho actual: 5px/);
    });

    it('should throw if image is too large (height)', () => {
      pipe = new ImageValidationPipe({ maxHeight: 2000 });
      mockedSizeOf.mockReturnValue({ width: 1000, height: 2500 });

      const file = createMockFile(500);
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(() => pipe.transform(file)).toThrow(/Alto máximo: 2000px, Alto actual: 2500px/);
    });
  });
});
