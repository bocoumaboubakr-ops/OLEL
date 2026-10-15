import { Module } from '@nestjs/common';
import { FlagsModule } from '../flags/flags.module';
import { SystemController } from './system.controller';

@Module({ imports: [FlagsModule], controllers: [SystemController] })
export class SystemModule {}
