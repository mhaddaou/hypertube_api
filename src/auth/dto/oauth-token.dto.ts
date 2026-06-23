import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class OAuthTokenDto {
  @ApiProperty({ example: 'client_credentials' })
  @IsString()
  grant_type: string;

  @ApiProperty()
  @IsString()
  client_id: string;

  @ApiProperty()
  @IsString()
  client_secret: string;
}
