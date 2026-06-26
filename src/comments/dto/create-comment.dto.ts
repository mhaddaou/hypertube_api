import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Great movie.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  comment: string;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  movie_id: number;
}
