import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { OtpService } from './otp.service';
import { RefreshTokenService } from './refresh-token.service';
import { MailModule } from '../../common/mail/mail.module';

type JwtExpiresIn = NonNullable<
  NonNullable<JwtModuleOptions['signOptions']>['expiresIn']
>;

@Module({
  imports: [
    MailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const configuredExpiration =
          configService.get<string>('JWT_EXPIRATION') ?? '24h';

        if (!/^\d+(ms|s|m|h|d|w|y)$/.test(configuredExpiration)) {
          throw new Error(
            'JWT_EXPIRATION must use a duration such as "15m", "24h" or "7d"',
          );
        }

        return {
          secret: configService.getOrThrow<string>('JWT_SECRET'),
          signOptions: {
            expiresIn: configuredExpiration as JwtExpiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, OtpService, RefreshTokenService],
  exports: [AuthService, JwtModule, OtpService, RefreshTokenService],
})
export class AuthModule {}
