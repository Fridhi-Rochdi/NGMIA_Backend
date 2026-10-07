import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlannerService } from './planner.service';
import {
  GenerateCalendarDto,
  CreateCalendarDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './planner.dto';
import { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { TenantGuard } from '../../common/guards/tenant.guard';

import { AiQuota } from '../../common/quota/ai-quota.decorator';
@ApiTags('Planner')
@Controller('planner')
@UseGuards(TenantGuard)
@ApiBearerAuth()
export class PlannerController {
  constructor(private readonly plannerService: PlannerService) {}

  @AiQuota('planner.generate', 5)
  @Post('generate')
  async generate(@Body() dto: GenerateCalendarDto, @Request() req: AuthenticatedRequest) {
    return this.plannerService.generateCalendar(req.user.sub, req.tenant.id, dto);
  }

  @Post()
  async create(@Body() dto: CreateCalendarDto, @Request() req: AuthenticatedRequest) {
    return this.plannerService.createCalendar(req.user.sub, req.tenant.id, dto);
  }

  @Get()
  async findAll(@Request() req: AuthenticatedRequest) {
    return this.plannerService.findAll(req.tenant.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.plannerService.findOne(id, req.tenant.id);
  }

  @Get(':calendarId/events')
  async findEvents(
    @Param('calendarId') calendarId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.plannerService.findEvents(calendarId, req.tenant.id);
  }

  @Post(':calendarId/events')
  async addEvent(
    @Param('calendarId') calendarId: string,
    @Body() dto: CreateCalendarEventDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.plannerService.addEvent(calendarId, req.tenant.id, dto);
  }

  @Put('events/:id')
  async updateEvent(@Param('id') id: string, @Body() dto: UpdateCalendarEventDto, @Request() req: AuthenticatedRequest) {
    return this.plannerService.updateEvent(id, req.tenant.id, dto);
  }

  @Delete('events/:id')
  async removeEvent(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.plannerService.removeEvent(id, req.tenant.id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.plannerService.remove(id, req.tenant.id);
  }
  // ============================================
  // Publication automatique
  // ============================================

  /**
   * Publish one event now, through the same path the scheduler uses.
   *
   * A separate "publish now" implementation would be a second thing to keep
   * correct, and the two would drift.
   */
  @Post('events/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publishNow(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.plannerService.publishEventNow(id, req.tenant.id);
  }

  /** Turn automatic publishing on or off for one event. */
  @Put('events/:id/auto-publish')
  async setAutoPublish(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.plannerService.setAutoPublish(id, req.tenant.id, Boolean(body?.enabled));
  }

  /** Arm every scheduled event of a calendar at once. */
  @Put(':id/auto-publish')
  async setCalendarAutoPublish(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.plannerService.setCalendarAutoPublish(id, req.tenant.id, Boolean(body?.enabled));
  }

  /** What is queued, what went out, what failed and why. */
  @Get(':id/publishing')
  async publishingStatus(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.plannerService.publishingStatus(id, req.tenant.id);
  }

}
