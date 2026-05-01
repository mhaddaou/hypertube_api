import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import {
  UserListItemDto,
  UserOwnProfileDto,
  UserPublicProfileDto,
} from './dto/user-response.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<UserListItemDto[]> {
    const users = await this.prisma.user.findMany({
      select: { id: true, username: true },
    });
    return users;
  }

  async findById(
    id: string,
    requesterId: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    return {
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture,
    };
  }

  async updateUser(
    id: string,
    requesterId: string,
    dto: UpdateUserDto,
  ): Promise<UserOwnProfileDto> {
    if (id !== requesterId) {
      throw new ForbiddenException('You can only update your own profile');
    }

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    if (dto.username && dto.username !== existing.username) {
      const taken = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (taken) throw new ConflictException('Username already taken');
    }

    if (dto.email && dto.email !== existing.email) {
      const taken = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (taken) throw new ConflictException('Email already in use');
    }

    const data: Record<string, unknown> = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
      delete data.password;
    }

    const updated = await this.prisma.user.update({ where: { id }, data });

    return {
      id: updated.id,
      username: updated.username,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      profilePicture: updated.profilePicture,
      language: updated.language,
    };
  }
}
