import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard/jwt-auth.guard';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [
    UsersModule,
    SessionsModule,
    PassportModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),

        signOptions: {
          expiresIn: configService.getOrThrow<JwtSignOptions['expiresIn']>(
            'JWT_ACCESS_EXPIRES_IN',
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
})
export class AuthModule {}
