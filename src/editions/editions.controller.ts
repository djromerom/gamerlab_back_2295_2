import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  ParseIntPipe, UseInterceptors, UploadedFiles, UploadedFile,
  Query, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, HttpCode,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags, ApiOperation, ApiParam, ApiResponse, ApiConsumes, ApiBearerAuth,
} from '@nestjs/swagger';
import { EditionsService } from './editions.service';
import { CreateEditionDto } from './dto/create-edition.dto';
import { UpdateEditionDto } from './dto/update-edition.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { DeletePhotosDto } from './dto/delete-photos.dto';
import { ImageValidationPipe } from '../upload/pipes/image-validation.pipe';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Editions')
@ApiBearerAuth()
@Controller('editions')
export class EditionsController {
  constructor(private readonly editionsService: EditionsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new edition' })
  @ApiResponse({ status: 201, description: 'Edition created successfully.' })
  @ApiResponse({ status: 400, description: 'Duplicate year/semester.' })
  create(@Body() createEditionDto: CreateEditionDto) {
    return this.editionsService.create(createEditionDto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all editions (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated list of editions.' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.editionsService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single edition by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Edition found.' })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.editionsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an edition' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Edition updated.' })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() updateEditionDto: UpdateEditionDto) {
    return this.editionsService.update(id, updateEditionDto);
  }

  @Post(':id/main-photo')
  @UseInterceptors(FileInterceptor('mainPhoto'))
  @ApiOperation({ summary: 'Upload or replace the main photo of an edition' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 201, description: 'Main photo uploaded.' })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
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
        maxWidth: 6000,
        maxHeight: 6000,
      }),
    ) file: Express.Multer.File,
  ) {
    return this.editionsService.uploadMainPhoto(id, file);
  }

  @Post(':id/photos')
  @UseInterceptors(FilesInterceptor('photos', 20)) // Max 20 files per request chunk
  @ApiOperation({ summary: 'Upload additional photos for an edition (max 20 per request, 50 total)' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 201, description: 'Photos uploaded.' })
  @ApiResponse({ status: 400, description: 'Photo limit exceeded.' })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
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
        maxWidth: 6000,
        maxHeight: 6000,
      }),
    ) files: Express.Multer.File[],
  ) {
    return this.editionsService.uploadPhotos(id, files);
  }

  @Delete(':id/photos')
  @ApiOperation({ summary: 'Delete specific photos from an edition' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Photos deleted.' })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
  deletePhotos(
    @Param('id', ParseIntPipe) id: number,
    @Body() deletePhotosDto: DeletePhotosDto,
  ) {
    return this.editionsService.deletePhotos(id, deletePhotosDto);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate an edition (deactivates any currently active edition)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Edition activated.' })
  @ApiResponse({ status: 400, description: 'Cannot activate an ARCHIVED edition.' })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.editionsService.activate(id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive an edition (must be INACTIVE first; creates a historical dump)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Edition archived.' })
  @ApiResponse({ status: 400, description: 'Edition is not INACTIVE or historical dump already exists.' })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.editionsService.archive(id);
  }

  @Public()
  @Get(':id/videogames')
  @ApiOperation({ summary: 'Get all confirmed videogames of an edition' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'List of videogames.' })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
  getVideogamesByEdition(@Param('id', ParseIntPipe) id: number) {
    return this.editionsService.getVideogamesByEdition(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an edition' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Edition deleted.' })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.editionsService.remove(id);
  }
}
