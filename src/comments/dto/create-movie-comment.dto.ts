import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMovieCommentDto {
  @ApiProperty({ example: 'Great movie.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  comment: string;
}
