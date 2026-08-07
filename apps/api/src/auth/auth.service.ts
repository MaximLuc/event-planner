import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto/register.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto/login.dto';
import { createHash, randomUUID } from 'crypto';
import { SessionsService } from '../sessions/sessions.service';
import { ConfigService } from '@nestjs/config';
import { SessionMetadata } from '../sessions/types/create-session-data.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
    private readonly sessionsService: SessionsService,
    private readonly configService: ConfigService,
  ) {}
  async register(dto: RegisterDto) {
    const existingUser = await this.userService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('user already exist');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.userService.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      systemRole: user.systemRole,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async login(dto: LoginDto, metadata: SessionMetadata) {
    const existingUser = await this.userService.findByEmail(dto.email);
    if (!existingUser) {
      throw new UnauthorizedException('Invalid email or passwor');
    }
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      existingUser.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or passwor');
    }
    const accessToken = await this.jwtService.signAsync({
      sub: existingUser.id,
      role: existingUser.systemRole,
    });

    const sessionId = randomUUID();

    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    const refreshTtlSeconds = this.configService.getOrThrow<number>(
      'JWT_REFRESH_TTL_SECONDS',
    );
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: existingUser.id,
        sid: sessionId,
      },
      {
        secret: refreshSecret,
        expiresIn: refreshTtlSeconds,
      },
    );

    const refreshTokenHash = this.hashToken(refreshToken);

    const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);

    await this.sessionsService.create({
      id: sessionId,
      userId: existingUser.id,
      refreshTokenHash,
      expiresAt,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    });

    return {
      user: {
        id: existingUser.id,
        email: existingUser.email,
        name: existingUser.name,
        systemRole: existingUser.systemRole,
        emailVerifiedAt: existingUser.emailVerifiedAt,
        createdAt: existingUser.createdAt,
        updatedAt: existingUser.updatedAt,
      },
      accessToken,
      refreshToken,
    };
  }

  async getProfile(userId: string) {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      systemRole: user.systemRole,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
