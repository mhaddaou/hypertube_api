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

  async findLatest(limit = 20, movieId?: number): Promise<CommentResponse[]> {
    const take = Math.min(Math.max(limit, 1), 100);
    const comments = await this.prisma.comment.findMany({
      where: movieId ? { movieId } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: {
          select: { username: true, profilePicture: true },
        },
      },
    });

    return comments.map(mapComment);
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
