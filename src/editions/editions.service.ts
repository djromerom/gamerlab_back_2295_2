import { Injectable, NotFoundException, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEditionDto } from './dto/create-edition.dto';
import { UpdateEditionDto } from './dto/update-edition.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { Edition } from '@prisma/client';
import { AzureStorageService } from '../upload/azure-storage.service';
import { DeletePhotosDto } from './dto/delete-photos.dto';

@Injectable()
export class EditionsService {
  private readonly logger = new Logger(EditionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureStorageService: AzureStorageService,
  ) { }

  async create(createEditionDto: CreateEditionDto) {
    try {
      return await this.prisma.edition.create({
        data: createEditionDto,
      });
    } catch (error: any) {
      this.logger.error(`Error creating edition: ${error.message}`, error.stack);
      if (error.code === 'P2002') {
        throw new BadRequestException('Ya existe una edición con ese año y semestre (restricción única).');
      }
      throw new InternalServerErrorException('Error interno al crear la edición.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Edition>> {
    const { limit, page } = query;
    const offset = (page - 1) * limit;

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.edition.findMany({
        skip: offset,
        take: limit,
        orderBy: [{ year: 'desc' }, { semester: 'desc' }],
      }),
      this.prisma.edition.count(),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    // Map all items to include SAS URLs
    const itemsWithSas = await Promise.all(
      items.map(item => this.mapEditionPhotosWithSas(item))
    );

    return {
      data: itemsWithSas,
      metadata: {
        totalItems,
        itemsOnCurrentPage: items.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages,
      },
    };
  }

  async findOne(id: number) {
    const edition = await this.prisma.edition.findUnique({
      where: { id },
      include: {
        testimonials: true,
        educationalFocuses: true,
        highlightedGames: true,
      }
    });
    if (!edition) {
      throw new NotFoundException(`Edition #${id} not found`);
    }
    return this.mapEditionPhotosWithSas(edition);
  }

  async update(id: number, updateEditionDto: UpdateEditionDto) {
    await this.findOne(id);
    try {
      const updated = await this.prisma.edition.update({
        where: { id },
        data: updateEditionDto,
      });
      return await this.mapEditionPhotosWithSas(updated);
    } catch (error: any) {
      this.logger.error(`Error updating edition #${id}: ${error.message}`, error.stack);
      if (error.code === 'P2002') {
        throw new BadRequestException('Ya existe otra edición con ese id.');
      }
      throw new InternalServerErrorException('Error interno al actualizar la edición.');
    }
  }

  async uploadMainPhoto(id: number, file: Express.Multer.File) {
    const edition = await this.findOne(id);

    if (edition.mainPhoto) {
      try {
        await this.azureStorageService.deleteById(edition.mainPhoto);
      } catch (e) {
        console.warn(`No se pudo eliminar la foto principal anterior de la edición ${id}`);
      }
    }

    const upload = await this.azureStorageService.uploadFile(file, 5 * 1024 * 1024); // 5MB max

    const updated = await this.prisma.edition.update({
      where: { id },
      data: { mainPhoto: upload.id },
    });

    return this.mapEditionPhotosWithSas(updated);
  }

  async uploadPhotos(id: number, files: Express.Multer.File[]) {
    const edition = await this.findOne(id);

    if (!files || files.length === 0) {
      return edition;
    }

    const currentPhotosCount = Array.isArray(edition.photos) ? edition.photos.length : 0;
    if (currentPhotosCount + files.length > 50) {
      throw new BadRequestException(`No se pueden subir más imágenes. El límite es de 50 imágenes por edición. Actualmente hay ${currentPhotosCount} y estás intentando subir ${files.length}.`);
    }

    // Upload all the photos in parallel (each one with max 5MB)
    const uploads = await Promise.all(
      files.map(file => this.azureStorageService.uploadFile(file, 5 * 1024 * 1024))
    );

    const uploadIds = uploads.map(u => u.id);

    // Append to database
    const updated = await this.prisma.edition.update({
      where: { id },
      data: {
        photos: {
          push: uploadIds,
        },
      },
    });

    return this.mapEditionPhotosWithSas(updated);
  }

  async deletePhotos(id: number, deleteDto: DeletePhotosDto) {
    const edition = await this.findOne(id);
    const { uploadIds } = deleteDto;

    // Reassure that the photos to delete belong to this edition
    const idsToDelete = uploadIds.filter(uploadId => edition.photos.includes(uploadId));

    if (idsToDelete.length === 0) {
      return edition; // Nothing to delete
    }

    // Delete from Azure in parallel
    await Promise.all(
      idsToDelete.map(async (uploadId) => {
        try {
          await this.azureStorageService.deleteById(uploadId);
        } catch (error: any) {
          console.warn(`No se pudo eliminar de Azure el upload ${uploadId}:`, error.message);
        }
      })
    );

    // Update the array in database removing the deleted ids
    const newPhotos = edition.photos.filter((p: string) => !idsToDelete.includes(p));

    const updated = await this.prisma.edition.update({
      where: { id },
      data: {
        photos: {
          set: newPhotos,
        },
      },
    });

    return this.mapEditionPhotosWithSas(updated);
  }

  async activate(id: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const edition = await tx.edition.findUnique({ where: { id } });
        if (!edition) {
          throw new NotFoundException(`Edition #${id} not found`);
        }

        await tx.edition.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });

        return await tx.edition.update({
          where: { id },
          data: { isActive: true },
        });
      });
    } catch (error: any) {
      this.logger.error(`Error activating edition #${id}: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Error interno al activar la edición.');
    }
  }

  async getVideogamesByEdition(id: number) {
    await this.findOne(id); // validates edition exists
    const videogames = await this.prisma.videogame.findMany({
      where: {
        isActive: true,
        team: { editionId: id },
      },
      select: {
        id: true,
        name: true,
        description: true,
        logoUrl: true,
        team: { select: { teamName: true } },
      },
      orderBy: { name: 'asc' },
    });
    return videogames.map((vg) => ({
      id: vg.id,
      name: vg.name,
      descripcion: vg.description,
      logoUrl: vg.logoUrl,
      teamName: vg.team.teamName,
    }));
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.edition.delete({
      where: { id },
    });
  }

  private async mapEditionPhotosWithSas(edition: any) {
    const fixUrl = (url: string) => url ? url.replace('http://azurite:10000', 'http://localhost:10000') : url;

    if (edition.mainPhoto) {
      try {
        const sas = await this.azureStorageService.getReadSasUrlById(edition.mainPhoto, 3600);
        edition.mainPhotoUrl = fixUrl(sas.url);
      } catch (e) {
        edition.mainPhotoUrl = null;
      }
    } else {
      edition.mainPhotoUrl = null;
    }

    if (edition.photos && edition.photos.length > 0) {
      const photosUrls = await Promise.all(
        edition.photos.map(async (photoId: string) => {
          try {
            const sas = await this.azureStorageService.getReadSasUrlById(photoId, 3600);
            return { id: photoId, url: fixUrl(sas.url) };
          } catch (e) {
            return null;
          }
        })
      );
      edition.photosUrls = photosUrls.filter(Boolean);
    } else {
      edition.photosUrls = [];
    }

    return edition;
  }
}
