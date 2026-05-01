import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserListItemDto {
  @ApiProperty() id: string;
  @ApiProperty() username: string;
}

export class UserPublicProfileDto {
  @ApiProperty() id: string;
  @ApiProperty() username: string;
  @ApiPropertyOptional() profilePicture: string | null;
  @ApiProperty() language: string;
}

export class UserOwnProfileDto extends UserPublicProfileDto {
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
}
