import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';

@Module({ controllers: [ContactController] })
export class ContactModule {}
