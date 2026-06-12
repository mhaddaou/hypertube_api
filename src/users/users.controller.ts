import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { avatarUploadOptions } from './avatar-upload.config.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

interface JwtUser {
  userId: string;
}

@ApiTags('users')
@ApiSecurity('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users (id + username)' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user profile' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.usersService.findById(id, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update own profile' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(id, user.userId, dto);
  }

  @Post(':id/avatar')
  @ApiOperation({ summary: 'Upload a new profile picture' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('avatar', avatarUploadOptions))
  uploadAvatar(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.usersService.updateAvatar(
      id,
      user.userId,
      `/uploads/avatars/${file.filename}`,
    );
  }
}
