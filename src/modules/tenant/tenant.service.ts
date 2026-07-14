import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateTenantDto } from './tenant.dto';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private prisma: PrismaService) {}

  async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            users: true,
            brands: true,
            contents: true,
            images: true,
            calendars: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant non trouvé');
    }

    return tenant;
  }

  async updateTenant(tenantId: string, dto: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant non trouvé');
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: dto,
    });

    this.logger.log(`✅ Tenant updated: ${updated.slug}`);

    return updated;
  }

  async getTenantStats(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            users: true,
            brands: true,
            contents: true,
            images: true,
            calendars: true,
            socialAccounts: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant non trouvé');
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      limits: {
        maxUsers: tenant.maxUsers,
        maxProjects: tenant.maxProjects,
      },
      usage: {
        users: tenant._count.users,
        brands: tenant._count.brands,
        contents: tenant._count.contents,
        images: tenant._count.images,
        calendars: tenant._count.calendars,
        socialAccounts: tenant._count.socialAccounts,
      },
    };
  }
}