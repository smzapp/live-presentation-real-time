import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlansService } from '../platform/plans.service.js';
import { isValidBoardData, isValidBoardType, type BoardType } from './boards.types.js';

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  async list(ownerId: string, type?: string) {
    const boards = await this.prisma.board.findMany({
      where: { ownerId, ...(isValidBoardType(type) ? { type } : {}) },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, type: true, title: true, folderId: true, createdAt: true, updatedAt: true },
    });
    return boards;
  }

  private async assertFolderOwned(ownerId: string, folderId: string) {
    const folder = await this.prisma.boardFolder.findUnique({ where: { id: folderId } });
    if (!folder || folder.ownerId !== ownerId) throw new BadRequestException('Invalid folder');
  }

  private async findOwned(ownerId: string, id: string) {
    const board = await this.prisma.board.findUnique({ where: { id } });
    if (!board) throw new NotFoundException('Board not found');
    if (board.ownerId !== ownerId) throw new ForbiddenException('Not your board');
    return board;
  }

  async get(ownerId: string, id: string) {
    const board = await this.findOwned(ownerId, id);
    return { ...board, data: JSON.parse(board.data) };
  }

  async create(ownerId: string, input: { type: unknown; title?: unknown; data: unknown; folderId?: unknown }) {
    if (!isValidBoardType(input.type)) throw new BadRequestException('Invalid board type');
    if (!isValidBoardData(input.type, input.data)) throw new BadRequestException('Invalid board data');
    if (input.folderId !== undefined && input.folderId !== null) {
      if (typeof input.folderId !== 'string') throw new BadRequestException('Invalid folder');
      await this.assertFolderOwned(ownerId, input.folderId);
    }

    await this.plans.assertCanCreateBoard(ownerId);

    const fallbackTitle = input.type === 'whiteboard' ? 'Untitled board' : 'Untitled presentation';
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : fallbackTitle;

    const board = await this.prisma.board.create({
      data: {
        ownerId,
        type: input.type,
        title,
        data: JSON.stringify(input.data),
        folderId: typeof input.folderId === 'string' ? input.folderId : null,
      },
    });
    return { ...board, data: JSON.parse(board.data) };
  }

  async update(ownerId: string, id: string, input: { title?: unknown; data?: unknown; folderId?: unknown }) {
    const board = await this.findOwned(ownerId, id);
    const patch: { title?: string; data?: string; folderId?: string | null } = {};

    if (input.title !== undefined) {
      if (typeof input.title !== 'string' || !input.title.trim()) {
        throw new BadRequestException('Invalid title');
      }
      patch.title = input.title.trim();
    }
    if (input.data !== undefined) {
      if (!isValidBoardData(board.type as BoardType, input.data)) {
        throw new BadRequestException('Invalid board data');
      }
      patch.data = JSON.stringify(input.data);
    }
    if (input.folderId !== undefined) {
      if (input.folderId === null) {
        patch.folderId = null;
      } else if (typeof input.folderId === 'string') {
        await this.assertFolderOwned(ownerId, input.folderId);
        patch.folderId = input.folderId;
      } else {
        throw new BadRequestException('Invalid folder');
      }
    }

    const updated = await this.prisma.board.update({ where: { id }, data: patch });
    return { ...updated, data: JSON.parse(updated.data) };
  }

  async remove(ownerId: string, id: string) {
    await this.findOwned(ownerId, id);
    await this.prisma.board.delete({ where: { id } });
    return { ok: true };
  }

  async exportBoard(ownerId: string, id: string) {
    const board = await this.get(ownerId, id);
    return {
      title: board.title,
      type: board.type as BoardType,
      data: board.data,
      exportedAt: new Date().toISOString(),
    };
  }

  async importBoard(ownerId: string, payload: { title?: unknown; type?: unknown; data?: unknown }) {
    const title = typeof payload.title === 'string' ? `${payload.title} (imported)` : undefined;
    return this.create(ownerId, { type: payload.type, title, data: payload.data });
  }
}
