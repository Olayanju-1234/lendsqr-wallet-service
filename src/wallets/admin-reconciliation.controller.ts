import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard.js';
import {
  ReconciliationReport,
  ReconciliationService,
} from './reconciliation.service.js';

@Controller('admin/reconciliation')
@UseGuards(AdminKeyGuard)
export class AdminReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get()
  run(): Promise<ReconciliationReport> {
    return this.reconciliation.run();
  }
}
