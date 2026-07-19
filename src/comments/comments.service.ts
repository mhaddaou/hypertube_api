import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CommentResponse {
  id: string;
  movie_id: number;
  author_username: string;
  author_profile_picture: string | null;
  date: Date;
  content: string;
}

export interface PaginatedCommentsResponse {
  comments: CommentResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    movieId: number,
    comment: string,
  ): Promise<CommentResponse> {
    const content = comment.trim();
    if (!content) {
      throw new BadRequestException('Comment cannot be empty');
    }

    const created = await this.prisma.comment.create({
      data: {
        userId,
        movieId,
        content,
      },
      include: {
        user: {
          select: { username: true, profilePicture: true },
        },
      },
    });

    return mapComment(created);
  }

  async update(
    id: string,
    userId: string,
    comment: string,
  ): Promise<CommentResponse> {
    const content = comment.trim();
    if (!content) {
      throw new BadRequestException('Comment cannot be empty');
    }

    const existing = await this.prisma.comment.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      throw new NotFoundException('Comment not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    const updated = await this.prisma.comment.update({
      where: { id },
      data: { content },
      include: {
        user: {
          select: { username: true, profilePicture: true },
        },
      },
    });

    return mapComment(updated);
  }

  async delete(id: string, userId: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    await this.prisma.comment.delete({ where: { id } });
  }

  async findLatest(
    page = 1,
    limit = 20,
    movieId?: number,
  ): Promise<PaginatedCommentsResponse> {
    const take = Math.min(Math.max(limit, 1), 100);
    const currentPage = Math.max(page, 1);
    const where = movieId ? { movieId } : undefined;

    const [total, comments] = await this.prisma.$transaction([
      this.prisma.comment.count({ where }),
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * take,
        take,
        include: {
          user: {
            select: { username: true, profilePicture: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / take);

    return {
      comments: comments.map(mapComment),
      pagination: {
        page: currentPage,
        limit: take,
        total,
        total_pages: totalPages,
        has_next_page: currentPage < totalPages,
        has_previous_page: currentPage > 1 && totalPages > 0,
      },
    };
  }
}

function mapComment(comment: {
  id: string;
  movieId: number;
  content: string;
  createdAt: Date;
  user: { username: string; profilePicture: string | null };
}): CommentResponse {
  return {
    id: comment.id,
    movie_id: comment.movieId,
    author_username: comment.user.username,
    author_profile_picture: comment.user.profilePicture,
    date: comment.createdAt,
    content: comment.content,
  };
}
