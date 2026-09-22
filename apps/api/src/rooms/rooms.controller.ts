import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { RoomsService } from './rooms.service.js';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  async create(@Body('title') title?: string) {
    const room = await this.rooms.createRoom(title ?? 'Untitled session');
    return {
      code: room.code,
      title: room.title,
      hostToken: room.hostToken,
    };
  }

  @Get(':code')
  async lookup(@Param('code') code: string) {
    const room = await this.rooms.loadRoom(code);
    if (!room) throw new NotFoundException('Room not found');
    return {
      code: room.code,
      title: room.title,
      mode: room.mode,
      participantCount: this.rooms.onlineCount(room),
    };
  }
}
