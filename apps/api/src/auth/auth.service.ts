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

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
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

  async login(dto: LoginDto) {
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

    return {
      id: existingUser.id,
      email: existingUser.email,
      name: existingUser.name,
      systemRole: existingUser.systemRole,
      emailVerifiedAt: existingUser.emailVerifiedAt,
      createdAt: existingUser.createdAt,
      updatedAt: existingUser.updatedAt,
      accessToken: accessToken,
    };
  }
}
