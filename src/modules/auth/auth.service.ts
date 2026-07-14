import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterDto, LoginDto } from './auth.dto';
import * as bcrypt from 'bcrypt';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    tenantId: string;
    tenant: {
      id: string;
      name: string;
      slug: string;
      plan: string;
    };
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    // Check if tenant slug already exists
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });

    if (existingTenant) {
      throw new ConflictException('Ce slug de tenant est déjà utilisé');
    }

    // Check if user email already exists in this tenant
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        tenant: { slug: dto.tenantSlug },
      },
    });

    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà dans ce tenant');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // Create tenant and user in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug: dto.tenantSlug,
          plan: 'FREE',
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          firstName: dto.firstName || null,
          lastName: dto.lastName || null,
          role: 'OWNER',
          tenantId: tenant.id,
        },
      });

      return { tenant, user };
    });

    // Generate JWT
    const payload: JwtPayload = {
      sub: result.user.id,
      email: result.user.email,
      tenantId: result.tenant.id,
      role: result.user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    this.logger.log(`✅ User registered: ${result.user.email} in tenant: ${result.tenant.slug}`);

    return {
      accessToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
        tenantId: result.tenant.id,
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          slug: result.tenant.slug,
          plan: result.tenant.plan,
        },
      },
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    // Super Admin Check
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPass = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPass && dto.email === adminEmail && dto.password === adminPass) {
      let adminUser = await this.prisma.user.findFirst({
        where: { email: adminEmail },
        include: { tenant: true },
      });

      if (!adminUser) {
        // Create the admin user and a default tenant
        const hashedPassword = await bcrypt.hash(adminPass, 12);
        adminUser = await this.prisma.$transaction(async (tx) => {
          const tenant = await tx.tenant.create({
            data: {
              name: 'NextGen Admin',
              slug: 'admin',
              plan: 'PRO',
            },
          });
          const user = await tx.user.create({
            data: {
              email: adminEmail,
              password: hashedPassword,
              firstName: 'Super',
              lastName: 'Admin',
              role: 'ADMIN',
              tenantId: tenant.id,
            },
          });
          return { ...user, tenant };
        });
      }

      const payload: JwtPayload = {
        sub: adminUser.id,
        email: adminUser.email,
        tenantId: adminUser.tenantId,
        role: adminUser.role,
      };

      const accessToken = await this.jwtService.signAsync(payload);
      this.logger.log(`✅ Super Admin logged in: ${adminUser.email}`);

      return {
        accessToken,
        user: {
          id: adminUser.id,
          email: adminUser.email,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          role: adminUser.role,
          tenantId: adminUser.tenantId,
          tenant: {
            id: adminUser.tenant.id,
            name: adminUser.tenant.name,
            slug: adminUser.tenant.slug,
            plan: adminUser.tenant.plan,
          },
        },
      };
    }

    // Normal User Login
    const whereClause: any = {
      email: dto.email,
      isActive: true,
    };

    if (dto.tenantSlug) {
      whereClause.tenant = { slug: dto.tenantSlug };
    }

    const user = await this.prisma.user.findFirst({
      where: whereClause,
      include: { tenant: true },
    });

    if (!user) {
      this.logger.warn(`Login failed: User not found for email ${dto.email}`);
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`Login failed: Invalid password for user ${dto.email}`);
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Generate JWT
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    this.logger.log(`✅ User logged in: ${user.email}`);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
          slug: user.tenant.slug,
          plan: user.tenant.plan,
        },
      },
    };
  }

  async validateUser(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé ou inactif');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        plan: user.tenant.plan,
      },
    };
  }

  async updateProfile(userId: string, dto: { firstName?: string; lastName?: string }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      include: { tenant: true },
    });
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
    };
  }

  async changePassword(userId: string, dto: { currentPassword: string; newPassword: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const isValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect');

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });
    return { message: 'Password updated successfully' };
  }
}
