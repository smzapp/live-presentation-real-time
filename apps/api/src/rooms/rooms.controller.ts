import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { RoomsService } from './rooms.service.js';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  create(@Body('title') title?: string) {
    const room = this.rooms.createRoom(title ?? 'Untitled session');
    return {
      code: room.code,
      title: room.title,
      hostToken: room.hostToken,
    };
  }

  @Get(':code')
  lookup(@Param('code') code: string) {
    const room = this.rooms.getRoom(code);
    if (!room) throw new NotFoundException('Room not found');
    return {
      code: room.code,
      title: room.title,
      mode: room.mode,
      participantCount: room.participants.size,
    };
  }
}
