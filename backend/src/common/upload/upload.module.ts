import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { MediaController } from '../media/media.controller';

@Module({
  controllers: [UploadController, MediaController],
})
export class UploadModule {}
