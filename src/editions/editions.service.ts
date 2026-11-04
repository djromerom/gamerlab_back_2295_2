import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEditionDto } from './dto/create-edition.dto';
import { UpdateEditionDto } from './dto/update-edition.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { Edition, EditionStatus } from '@prisma/client';
import { AzureStorageService } from '../upload/azure-storage.service';
import { DeletePhotosDto } from './dto/delete-photos.dto';
import { HistoricalsService } from '../historicals/historicals.service';
import { BlobReferenceService } from '../upload/blob-reference.service';

const DUPLICATE_EDITION_MESSAGE = 'La edición ya existe';

@Injectable()
export class EditionsService {
  private readonly logger = new Logger(EditionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureStorageService: AzureStorageService,
    private readonly historicalsService: HistoricalsService,
    private readonly blobRefs: BlobReferenceService,
  ) { }

  async create(createEditionDto: CreateEditionDto) {
    this.logger.log(`Creating new edition`);
    this.logger.debug(`Payload: ${JSON.stringify(createEditionDto)}`);
    this.ensureDatesInOrder(createEditionDto.startsAt, createEditionDto.endsAt);
    await this.ensureYearSemesterIsFree(createEditionDto.year, createEditionDto.semester);
    try {
      // La configuración del evento (inscripciones, evaluaciones, ranking) nace con la edición,
      // cerrada por defecto, en la misma operación. Sin ella los interruptores del panel
      // devolvían 404 (ARK-123).
      const result = await this.prisma.edition.create({
        data: { ...createEditionDto, eventConfiguration: { create: {} } },
      });
      this.logger.log(`Edition #${result.id} created successfully`);
      return result;
    } catch (error: any) {
      this.logger.error(`Error creating edition: ${error.message}`, error.stack);
      if (error.code === 'P2002') {
        throw new ConflictException(DUPLICATE_EDITION_MESSAGE);
      }
      throw new InternalServerErrorException('Error interno al crear la edición.');
    }
  }

  private ensureDatesInOrder(startsAt?: Date | null, endsAt?: Date | null) {
    if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
      throw new BadRequestException('La fecha de finalización no puede ser anterior a la de inicio');
    }
  }

  // Año + semestre identifican la edición; la restricción única de la base cubre las carreras.
  private async ensureYearSemesterIsFree(year: number, semester: number, excludeId?: number) {
    const existing = await this.prisma.edition.findFirst({
      where: { year, semester, ...(excludeId !== undefined && { id: { not: excludeId } }) },
      select: { id: true },
    });
    if (existing) {
      this.logger.warn(`Edition ${year}-${semester} already exists (#${existing.id})`);
      throw new ConflictException(DUPLICATE_EDITION_MESSAGE);
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Edition>> {
    const { limit, page } = query;
    const offset = (page - 1) * limit;

    this.logger.log(`Fetching editions — page ${page}, limit ${limit}`);

    try {
      const [items, totalItems] = await this.prisma.$transaction([
        this.prisma.edition.findMany({
          skip: offset,
          take: limit,
          orderBy: [{ year: 'desc' }, { semester: 'desc' }],
        }),
        this.prisma.edition.count(),
      ]);

      const totalPages = Math.ceil(totalItems / limit);

      this.logger.log(`Found ${items.length} editions (total: ${totalItems}, pages: ${totalPages})`);

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
    } catch (error: any) {
      this.logger.error(`Error fetching editions: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error interno al obtener las ediciones.');
    }
  }

  async findOne(id: number) {
    this.logger.log(`Looking up edition #${id}`);
    const edition = await this.prisma.edition.findUnique({
      where: { id },
      include: {
        testimonials: true,
        educationalFocuses: true,
        highlightedGames: true,
      }
    });
    if (!edition) {
      this.logger.warn(`Edition #${id} not found`);
      throw new NotFoundException(`Edition #${id} not found`);
    }
    this.logger.debug(`Edition #${id} found`);
    return this.mapEditionPhotosWithSas(edition);
  }

  async update(id: number, updateEditionDto: UpdateEditionDto) {
    this.logger.log(`Updating edition #${id}`);
    this.logger.debug(`Update payload: ${JSON.stringify(updateEditionDto)}`);
    const current = await this.findOne(id);
    // Solo se valida si el PATCH toca alguna fecha; así una edición ya inconsistente sigue editable.
    if (updateEditionDto.startsAt !== undefined || updateEditionDto.endsAt !== undefined) {
      this.ensureDatesInOrder(
        updateEditionDto.startsAt ?? current.startsAt,
        updateEditionDto.endsAt ?? current.endsAt,
      );
    }
    if (updateEditionDto.year !== undefined || updateEditionDto.semester !== undefined) {
      await this.ensureYearSemesterIsFree(
        updateEditionDto.year ?? current.year,
        updateEditionDto.semester ?? current.semester,
        id,
      );
    }
    try {
      const updated = await this.prisma.edition.update({
        where: { id },
        data: updateEditionDto,
      });
      this.logger.log(`Edition #${id} updated successfully`);
      return await this.mapEditionPhotosWithSas(updated);
    } catch (error: any) {
      this.logger.error(`Error updating edition #${id}: ${error.message}`, error.stack);
      if (error.code === 'P2002') {
        throw new ConflictException(DUPLICATE_EDITION_MESSAGE);
      }
      throw new InternalServerErrorException('Error interno al actualizar la edición.');
    }
  }

  async uploadMainPhoto(id: number, file: Express.Multer.File) {
    this.logger.log(`Uploading main photo for edition #${id} (${file.originalname}, ${file.size} bytes)`);
    const edition = await this.findOne(id);

    if (edition.mainPhoto) {
      this.logger.debug(`Deleting previous main photo (id: ${edition.mainPhoto}) for edition #${id}`);
      try {
        await this.azureStorageService.deleteById(edition.mainPhoto);
        this.logger.log(`Previous main photo deleted for edition #${id}`);
      } catch (e) {
        this.logger.warn(`Could not delete previous main photo for edition #${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const upload = await this.azureStorageService.uploadFile(file);
    this.logger.log(`Main photo uploaded (uploadId: ${upload.id}) for edition #${id}`);

    const updated = await this.prisma.edition.update({
      where: { id },
      data: { mainPhoto: upload.id },
    });

    return this.mapEditionPhotosWithSas(updated);
  }

  async uploadPhotos(id: number, files: Express.Multer.File[]) {
    this.logger.log(`Uploading ${files?.length ?? 0} photo(s) for edition #${id}`);
    const edition = await this.findOne(id);

    if (!files || files.length === 0) {
      this.logger.warn(`uploadPhotos called with no files for edition #${id} — returning current state`);
      return edition;
    }

    const currentPhotosCount = Array.isArray(edition.photos) ? edition.photos.length : 0;
    if (currentPhotosCount + files.length > 50) {
      this.logger.warn(
        `Upload rejected for edition #${id}: would exceed 50-photo limit (current: ${currentPhotosCount}, incoming: ${files.length})`,
      );
      throw new BadRequestException(`No se pueden subir más imágenes. El límite es de 50 imágenes por edición. Actualmente hay ${currentPhotosCount} y estás intentando subir ${files.length}.`);
    }

    // Upload all the photos in parallel (each one with max 5MB)
    const uploads = await Promise.all(
      files.map(file => this.azureStorageService.uploadFile(file))
    );

    const uploadIds = uploads.map(u => u.id);
    this.logger.log(`${uploadIds.length} photo(s) uploaded to Azure for edition #${id}: [${uploadIds.join(', ')}]`);

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
    this.logger.log(`Deleting photos from edition #${id}: [${deleteDto.uploadIds.join(', ')}]`);
    const edition = await this.findOne(id);
    const { uploadIds } = deleteDto;

    // Reassure that the photos to delete belong to this edition
    const idsToDelete = uploadIds.filter(uploadId => edition.photos.includes(uploadId));

    if (idsToDelete.length === 0) {
      this.logger.warn(`No matching photos found to delete in edition #${id} (requested: [${uploadIds.join(', ')}])`);
      return edition; // Nothing to delete
    }

    this.logger.debug(`Photos to delete from edition #${id}: [${idsToDelete.join(', ')}]`);

    // Delete from Azure in parallel
    await Promise.all(
      idsToDelete.map(async (uploadId) => {
        try {
          await this.azureStorageService.deleteById(uploadId);
          this.logger.debug(`Deleted photo ${uploadId} from Azure for edition #${id}`);
        } catch (error: any) {
          this.logger.warn(`Could not delete photo ${uploadId} from Azure for edition #${id}: ${error.message}`);
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

    this.logger.log(`${idsToDelete.length} photo(s) deleted from edition #${id}`);

    return this.mapEditionPhotosWithSas(updated);
  }

  async activate(id: number) {
    this.logger.log(`Activating edition #${id}`);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const edition = await tx.edition.findUnique({ where: { id } });
        if (!edition) {
          this.logger.warn(`Activation failed: edition #${id} not found`);
          throw new NotFoundException(`Edition #${id} not found`);
        }

        if (edition.status === EditionStatus.ARCHIVED) {
          this.logger.warn(`Activation rejected for edition #${id}: edition is ARCHIVED`);
          throw new BadRequestException(`No se puede activar una edición archivada.`);
        }

        // Desactivar la actualmente activa (si existe)
        await tx.edition.updateMany({
          where: { status: EditionStatus.ACTIVE },
          data: { status: EditionStatus.INACTIVE },
        });
        this.logger.debug(`Previous ACTIVE edition(s) set to INACTIVE before activating edition #${id}`);

        // Activar la edición solicitada
        const result = await tx.edition.update({
          where: { id },
          data: { status: EditionStatus.ACTIVE },
        });

        // Las ediciones creadas antes de ARK-123 pueden no tener configuración del evento.
        // `update: {}` deja intactos los interruptores de las que ya la tienen.
        await tx.eventConfiguration.upsert({
          where: { editionId: id },
          update: {},
          create: { editionId: id },
        });

        this.logger.log(`Edition #${id} activated successfully`);
        return result;
      });
    } catch (error: any) {
      this.logger.error(`Error activating edition #${id}: ${error.message}`, error.stack);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Error interno al activar la edición.');
    }
  }

  async archive(id: number) {
    this.logger.log(`Archiving edition #${id}`);
    const edition = await this.findOne(id);

    if (edition.status !== EditionStatus.INACTIVE) {
      this.logger.warn(`Archive rejected for edition #${id}: current status is ${edition.status} (must be INACTIVE)`);
      throw new BadRequestException(
        `Solo se puede archivar una edición en estado INACTIVE. Estado actual: ${edition.status}`,
      );
    }

    this.logger.log(`Creating historical dump for edition #${id}`);
    // Crear dump histórico (lanza si ya existe o si no tiene equipos)
    await this.historicalsService.createHistoricalEditionDump(id);

    // Marcar como ARCHIVED
    const result = await this.prisma.edition.update({
      where: { id },
      data: { status: EditionStatus.ARCHIVED },
    });

    this.logger.log(`Edition #${id} archived successfully`);
    return result;
  }

  async getVideogamesByEdition(id: number) {
    this.logger.log(`Fetching videogames for edition #${id}`);
    await this.findOne(id); // validates edition exists
    const videogames = await this.prisma.videogame.findMany({
      where: {
        isActive: true,
        videogameStatusId: 1,
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
    this.logger.log(`Found ${videogames.length} videogame(s) for edition #${id}`);
    await this.blobRefs.resolveInPlace(videogames);
    return videogames.map((vg) => ({
      id: vg.id,
      name: vg.name,
      descripcion: vg.description,
      logoUrl: vg.logoUrl,
      teamName: vg.team.teamName,
    }));
  }

  async remove(id: number) {
    this.logger.log(`Deleting edition #${id}`);
    await this.findOne(id);
    try {
      const result = await this.prisma.edition.delete({ where: { id } });
      this.logger.log(`Edition #${id} deleted successfully`);
      return result;
    } catch (error: any) {
      this.logger.error(`Error deleting edition #${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error interno al eliminar la edición.');
    }
  }

  private async mapEditionPhotosWithSas(edition: any) {
    const fixUrl = (url: string) => url ? url.replace('http://azurite:10000', 'http://localhost:10000') : url;

    if (edition.mainPhoto) {
      try {
        const sas = await this.azureStorageService.getReadSasUrlById(edition.mainPhoto, 3600);
        edition.mainPhotoUrl = fixUrl(sas.url);
      } catch (e) {
        this.logger.warn(`Could not generate SAS URL for mainPhoto ${edition.mainPhoto} of edition #${edition.id}`);
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
            this.logger.warn(`Could not generate SAS URL for photo ${photoId} of edition #${edition.id}`);
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
