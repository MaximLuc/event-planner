import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto/register.dto';
import { LoginDto } from './dto/login.dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard/jwt-auth.guard';
import type { AuthenticatedUser } from './types/jwt-payload.type';
import { CurrentUser } from './decorators/current-user/current-user.decorator';
import type { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, {
      userAgent: request.get('user-agent'),
      ipAddress: request.ip,
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.userId);
  }
}
