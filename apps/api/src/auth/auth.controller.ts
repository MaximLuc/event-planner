import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, type Request, type Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto/register.dto';
import { LoginDto } from './dto/login.dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard/jwt-auth.guard';
import type { AuthenticatedUser } from './types/jwt-payload.type';
import { CurrentUser } from './decorators/current-user/current-user.decorator';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto, {
      userAgent: request.get('user-agent'),
      ipAddress: request.ip,
    });
    this.setRefreshCookie(response, result.refreshToken);

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.userId);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.getRefreshToken(request);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }
    const result = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(response, result.refreshToken);
    return {
      accessToken: result.accessToken,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const refreshToken = this.getRefreshToken(request);
    try {
      if (refreshToken) {
        await this.authService.logout(refreshToken);
      }
    } finally {
      this.clearRefreshCookie(response);
    }
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.loguotAll(user.userId);
    this.clearRefreshCookie(response);
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    const refreshTtlSeconds = this.configService.getOrThrow<number>(
      'JWT_REFRESH_TTL_SECONDS',
    );

    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.getBaseCookieOptions(),
      maxAge: refreshTtlSeconds * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_TOKEN_COOKIE, this.getBaseCookieOptions());
  }

  private getBaseCookieOptions(): CookieOptions {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/api/v1/auth',
    };
  }

  private getRefreshToken(request: Request): string | undefined {
    const cookies: unknown = request.cookies;

    if (!cookies || typeof cookies !== 'object') {
      return undefined;
    }

    const refreshToken = (cookies as Record<string, unknown>)[
      REFRESH_TOKEN_COOKIE
    ];
    return typeof refreshToken === 'string' ? refreshToken : undefined;
  }
}
