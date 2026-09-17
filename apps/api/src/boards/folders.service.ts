import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class FoldersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string) {
    const folders = await this.prisma.boardFolder.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, createdAt: true, _count: { select: { boards: true } } },
    });
    return folders.map((f) => ({ id: f.id, name: f.name, createdAt: f.createdAt, boardCount: f._count.boards }));
  }

  private async findOwned(ownerId: string, id: string) {
    const folder = await this.prisma.boardFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException('Folder not found');
    if (folder.ownerId !== ownerId) throw new ForbiddenException('Not your folder');
    return folder;
  }

  async create(ownerId: string, input: { name?: unknown }) {
    if (typeof input.name !== 'string' || !input.name.trim()) {
      throw new BadRequestException('Invalid folder name');
    }
    return this.prisma.boardFolder.create({ data: { ownerId, name: input.name.trim() } });
  }

  async rename(ownerId: string, id: string, input: { name?: unknown }) {
    await this.findOwned(ownerId, id);
    if (typeof input.name !== 'string' || !input.name.trim()) {
      throw new BadRequestException('Invalid folder name');
    }
    return this.prisma.boardFolder.update({ where: { id }, data: { name: input.name.trim() } });
  }

  async remove(ownerId: string, id: string) {
    await this.findOwned(ownerId, id);
    // Boards inside are ungrouped, not deleted — folders are just an
    // organizational label, so removing one shouldn't destroy work.
    await this.prisma.board.updateMany({ where: { folderId: id }, data: { folderId: null } });
    await this.prisma.boardFolder.delete({ where: { id } });
    return { ok: true };
  }
}
