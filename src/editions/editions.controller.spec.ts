import { Test, TestingModule } from '@nestjs/testing';
import { EditionsController } from './editions.controller';
import { EditionsService } from './editions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EditionsController', () => {
  let controller: EditionsController;

  const mockEditionsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    uploadMainPhoto: jest.fn(),
    uploadPhotos: jest.fn(),
    deletePhotos: jest.fn(),
    activate: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EditionsController],
      providers: [
        { provide: EditionsService, useValue: mockEditionsService },
      ],
    }).compile();

    controller = module.get<EditionsController>(EditionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call editionsService.create with the provided DTO', async () => {
      const dto = { year: 2025, semester: 10, title: 'Test', startsAt: new Date(), endsAt: new Date() };
      mockEditionsService.create.mockResolvedValue({ id: 1, ...dto });
      const result = await controller.create(dto as any);
      expect(mockEditionsService.create).toHaveBeenCalledWith(dto);
      expect(result).toMatchObject({ id: 1 });
    });
  });

  describe('findAll', () => {
    it('should call editionsService.findAll with the pagination query', async () => {
      const query = { limit: 10, page: 1, includeInactive: false };
      mockEditionsService.findAll.mockResolvedValue({ data: [], metadata: {} });
      await controller.findAll(query as any);
      expect(mockEditionsService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('should call editionsService.findOne with the correct id', async () => {
      mockEditionsService.findOne.mockResolvedValue({ id: 1 });
      await controller.findOne(1);
      expect(mockEditionsService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('update', () => {
    it('should call editionsService.update with id and DTO', async () => {
      const dto = { title: 'Updated' };
      mockEditionsService.update.mockResolvedValue({ id: 1, ...dto });
      await controller.update(1, dto as any);
      expect(mockEditionsService.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('uploadMainPhoto', () => {
    it('should call editionsService.uploadMainPhoto', async () => {
      const file = { originalname: 'test.jpg' } as any;
      mockEditionsService.uploadMainPhoto.mockResolvedValue({ id: 1, mainPhoto: 'uuid-1' });
      await controller.uploadMainPhoto(1, file);
      expect(mockEditionsService.uploadMainPhoto).toHaveBeenCalledWith(1, file);
    });
  });

  describe('uploadPhotos', () => {
    it('should call editionsService.uploadPhotos', async () => {
      const files = [{ originalname: 'test.jpg' }] as any;
      mockEditionsService.uploadPhotos.mockResolvedValue({ id: 1, photos: ['uuid-1'] });
      await controller.uploadPhotos(1, files);
      expect(mockEditionsService.uploadPhotos).toHaveBeenCalledWith(1, files);
    });
  });

  describe('deletePhotos', () => {
    it('should call editionsService.deletePhotos', async () => {
      const deleteDto = { uploadIds: ['uuid-1'] };
      mockEditionsService.deletePhotos.mockResolvedValue({ id: 1 });
      await controller.deletePhotos(1, deleteDto);
      expect(mockEditionsService.deletePhotos).toHaveBeenCalledWith(1, deleteDto);
    });
  });

  describe('activate', () => {
    it('should call editionsService.activate with the correct id', async () => {
      mockEditionsService.activate.mockResolvedValue({ id: 1, isActive: true });
      await controller.activate(1);
      expect(mockEditionsService.activate).toHaveBeenCalledWith(1);
    });
  });

  describe('remove', () => {
    it('should call editionsService.remove with the correct id', async () => {
      mockEditionsService.remove.mockResolvedValue({ id: 1 });
      await controller.remove(1);
      expect(mockEditionsService.remove).toHaveBeenCalledWith(1);
    });
  });
});
