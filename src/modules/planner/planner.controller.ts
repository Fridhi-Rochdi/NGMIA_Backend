import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlannerService } from './planner.service';
import {
  GenerateCalendarDto,
  CreateCalendarDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './planner.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@ApiTags('Planner')
@Controller('planner')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class PlannerController {
  constructor(private readonly plannerService: PlannerService) {}

  @Post('generate')
  async generate(@Body() dto: GenerateCalendarDto, @Request() req) {
    return this.plannerService.generateCalendar(req.user.userId, req.tenant.id, dto);
  }

  @Post()
  async create(@Body() dto: CreateCalendarDto, @Request() req) {
    return this.plannerService.createCalendar(req.user.userId, req.tenant.id, dto);
  }

  @Get()
  async findAll(@Request() req) {
    return this.plannerService.findAll(req.tenant.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    return this.plannerService.findOne(id, req.tenant.id);
  }

  @Post(':calendarId/events')
  async addEvent(
    @Param('calendarId') calendarId: string,
    @Body() dto: CreateCalendarEventDto,
    @Request() req,
  ) {
    return this.plannerService.addEvent(calendarId, req.tenant.id, dto);
  }

  @Put('events/:id')
  async updateEvent(@Param('id') id: string, @Body() dto: UpdateCalendarEventDto, @Request() req) {
    return this.plannerService.updateEvent(id, req.tenant.id, dto);
  }

  @Delete('events/:id')
  async removeEvent(@Param('id') id: string, @Request() req) {
    return this.plannerService.removeEvent(id, req.tenant.id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req) {
    return this.plannerService.remove(id, req.tenant.id);
  }
}
