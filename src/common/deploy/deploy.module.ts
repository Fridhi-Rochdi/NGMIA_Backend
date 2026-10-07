import { Module } from '@nestjs/common';
import { VercelDeploymentService } from '../../modules/website/vercel-deployment.service';

/**
 * Deployment of published documents, shared by every module that ships one.
 *
 * Websites, menus and posters are all self-contained HTML documents that go to
 * the same place, so they use the same deployer. It lived inside WebsiteModule
 * and was reachable from nowhere else, which is why a published menu was only
 * ever a route on the app's own front end: a QR code on a restaurant table
 * pointed at a page that stops existing the moment the app is down.
 */
@Module({
  providers: [VercelDeploymentService],
  exports: [VercelDeploymentService],
})
export class DeployModule {}
