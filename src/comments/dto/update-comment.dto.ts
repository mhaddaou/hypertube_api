import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCommentDto {
  @ApiProperty({ example: 'Great movie, watched it twice.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  comment: string;
}
