import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { EditionsService } from './editions.service';
import { EditionsController } from './editions.controller';
import { EducationalFocusesModule } from '../educational-focuses/educational-focuses.module';
import { HighlightedGamesModule } from '../highlighted-games/highlighted-games.module';
import { TestimonialsModule } from '../testimonials/testimonials.module';
import { HistoricalsModule } from '../historicals/historicals.module';
import { EducationalFocusesController } from './controllers/educational-focuses.controller';
import { HighlightedGamesController } from './controllers/highlighted-games.controller';
import { TestimonialsController } from './controllers/testimonials.controller';

@Module({
	imports: [
		EducationalFocusesModule,
		HighlightedGamesModule,
		TestimonialsModule,
		UploadModule,
		HistoricalsModule,
	],
	controllers: [
		EditionsController,
		EducationalFocusesController,
		HighlightedGamesController,
		TestimonialsController,
	],
	providers: [
		EditionsService
	],
	exports: [
		EditionsService
	]
})
export class EditionsModule { }
