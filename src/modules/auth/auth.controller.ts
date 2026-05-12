import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';

@Controller()
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password);
  }

  @UseGuards(LocalAuthGuard)
  @Post('auth/login')
  login(@CurrentUser() user: any) {
    return this.authService.login(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('auth/logout')
  logout(@CurrentUser() user: any) {
    return this.authService.logout(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('auth/refresh')
  refresh(@CurrentUser() user: any, @Body() dto: RefreshDto) {
    return this.authService.refresh(user.id, dto.refreshToken);
  }

  // key endpoint — job-platform calls this to verify tokens
  @Get('auth/validate')
  validate(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '');
    return this.authService.validate(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('users/me')
  getProfile(@CurrentUser() user: any) {
    return this.usersService.findById(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('users/me')
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }
}
