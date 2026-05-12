import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return null;
    return user;
  }

  async register(email: string, password: string) {
    const user = await this.usersService.create(email, password);
    const tokens = await this.generateTokens(user._id.toString(), user.email);
    await this.usersService.saveRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );
    return tokens;
  }

  async login(user: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    const tokens = await this.generateTokens(user._id.toString(), user.email);
    await this.usersService.saveRefreshToken(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      user._id.toString(),
      tokens.refreshToken,
    );
    return tokens;
  }

  async logout(userId: string) {
    await this.usersService.clearRefreshToken(userId);
    return { message: 'Logged out successfully' };
  }

  async refresh(userId: string, refreshToken: string) {
    const valid = await this.usersService.validateRefreshToken(
      userId,
      refreshToken,
    );
    if (!valid) throw new UnauthorizedException('Invalid refresh token');
    const user = await this.usersService.findById(userId);
    const tokens = await this.generateTokens(userId, user.email);
    await this.usersService.saveRefreshToken(userId, tokens.refreshToken);
    return tokens;
  }

  async validate(token: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('jwt.secret'),
      });
      const user = await this.usersService.findById(payload.sub);
      return { valid: true, user };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
