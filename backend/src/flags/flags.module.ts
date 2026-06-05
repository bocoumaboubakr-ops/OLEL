import { Module } from '@nestjs/common';
import { FlagsController } from './flags.controller';
import { FlagsService } from './flags.service';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FlagsController],
  providers: [FlagsService],
  exports: [FlagsService],
})
export class FlagsModule {}
