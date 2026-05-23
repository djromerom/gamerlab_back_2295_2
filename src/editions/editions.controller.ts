import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, UseInterceptors, UploadedFiles, UploadedFile, Query, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { EditionsService } from './editions.service';
import { CreateEditionDto } from './dto/create-edition.dto';
import { UpdateEditionDto } from './dto/update-edition.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { DeletePhotosDto } from './dto/delete-photos.dto';
import { ImageValidationPipe } from '../upload/pipes/image-validation.pipe';
import { Public } from '../auth/decorators/public.decorator';

@Controller('editions')
export class EditionsController {
  constructor(private readonly editionsService: EditionsService) { }

  @Post()
  create(@Body() createEditionDto: CreateEditionDto) {
    return this.editionsService.create(createEditionDto);
  }

  @Public()
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.editionsService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.editionsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateEditionDto: UpdateEditionDto) {
    return this.editionsService.update(id, updateEditionDto);
  }

  @Post(':id/main-photo')
  @UseInterceptors(FileInterceptor('mainPhoto'))
  uploadMainPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB limit
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
      new ImageValidationPipe({
        minWidth: 10,
        minHeight: 10,
        maxWidth: 2000,
        maxHeight: 2000,
      }),
    ) file: Express.Multer.File,
  ) {
    return this.editionsService.uploadMainPhoto(id, file);
  }

  @Post(':id/photos')
  @UseInterceptors(FilesInterceptor('photos', 20)) // Max 20 files per request chunk
  uploadPhotos(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB limit per file
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
      new ImageValidationPipe({
        maxTotalSize: 25 * 1024 * 1024, // 25MB limit total
        minWidth: 10,
        minHeight: 10,
        maxWidth: 2000,
        maxHeight: 2000,
      }),
    ) files: Express.Multer.File[],
  ) {
    return this.editionsService.uploadPhotos(id, files);
  }

  @Delete(':id/photos')
  deletePhotos(
    @Param('id', ParseIntPipe) id: number,
    @Body() deletePhotosDto: DeletePhotosDto,
  ) {
    return this.editionsService.deletePhotos(id, deletePhotosDto);
  }

  @Patch(':id/activate')
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.editionsService.activate(id);
  }

  @Public()
  @Get(':id/videogames')
  getVideogamesByEdition(@Param('id', ParseIntPipe) id: number) {
    return this.editionsService.getVideogamesByEdition(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.editionsService.remove(id);
  }
}
