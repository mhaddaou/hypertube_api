import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { CreateMovieCommentDto } from './dto/create-movie-comment.dto.js';

interface JwtUser {
  userId: string;
  type: 'user' | 'client';
}

@ApiTags('comments')
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post('comments')
  @UseGuards(JwtAuthGuard)
  @ApiSecurity('access-token')
  @ApiOperation({ summary: 'Create a comment for a movie' })
  create(@Body() dto: CreateCommentDto, @CurrentUser() user: JwtUser) {
    assertUserToken(user);
    return this.commentsService.create(user.userId, dto.movie_id, dto.comment);
  }

  @Post('movies/:movie_id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiSecurity('access-token')
  @ApiOperation({ summary: 'Create a comment for a movie' })
  createForMovie(
    @Param('movie_id') movieIdParam: string,
    @Body() dto: CreateMovieCommentDto,
    @CurrentUser() user: JwtUser,
  ) {
    assertUserToken(user);
    const movieId = parsePositiveInt(movieIdParam, 'Invalid movie id');
    return this.commentsService.create(user.userId, movieId, dto.comment);
  }

  @Delete('comments/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiSecurity('access-token')
  @ApiOperation({ summary: 'Delete one of your comments' })
  async delete(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    assertUserToken(user);
    await this.commentsService.delete(id, user.userId);
    return { message: 'Comment deleted successfully' };
  }

  @Get('comments')
  @ApiOperation({ summary: 'List latest comments' })
  @ApiQuery({ name: 'movie_id', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findLatest(
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('movie_id') movieId: string | undefined,
  ) {
    return this.commentsService.findLatest(
      parseOptionalPositiveInt(page, 1, 'Invalid page'),
      parseOptionalPositiveInt(limit, 20, 'Invalid limit'),
      parseOptionalPositiveInt(movieId, undefined, 'Invalid movie id'),
    );
  }
}

function assertUserToken(user: JwtUser): void {
  if (user.type !== 'user') {
    throw new UnauthorizedException('A user access token is required');
  }
}

function parsePositiveInt(value: string, errorMessage: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(errorMessage);
  }
  return parsed;
}

function parseOptionalPositiveInt(
  value: string | undefined,
  fallback: number | undefined,
  errorMessage: string,
): number | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }
  return parsePositiveInt(value, errorMessage);
}
