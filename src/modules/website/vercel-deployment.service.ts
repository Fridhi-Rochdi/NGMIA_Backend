import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface VercelDeploymentResult {
  projectId: string;
  deploymentId: string;
  url: string;
  status: 'BUILDING' | 'READY' | 'ERROR';
}

@Injectable()
export class VercelDeploymentService {
  private readonly logger = new Logger(VercelDeploymentService.name);
  private readonly token: string;
  private readonly teamId: string | undefined;
  private readonly baseUrl = 'https://api.vercel.com';

  constructor() {
    this.token = process.env.VERCEL_TOKEN || '';
    this.teamId = process.env.VERCEL_TEAM_ID || undefined;
    if (!this.token) {
      this.logger.warn('VERCEL_TOKEN is not set');
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private appendTeam(url: string): string {
    if (this.teamId) {
      return `${url}${url.includes('?') ? '&' : '?'}teamId=${this.teamId}`;
    }
    return url;
  }

  async ensureProject(subdomain: string): Promise<string> {
    const projectName = `ngmia-${subdomain}`.slice(0, 52).replace(/[^a-z0-9-]/g, '-');
    try {
      const getUrl = this.appendTeam(`${this.baseUrl}/v9/projects/${projectName}`);
      const res = await fetch(getUrl, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        this.logger.log(`Found existing Vercel project: ${data.id}`);
        return data.id;
      }
    } catch {}
    const createUrl = this.appendTeam(`${this.baseUrl}/v9/projects`);
    const res = await fetch(createUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name: projectName, framework: null }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create Vercel project: ${err}`);
    }
    const data = await res.json();
    return data.id;
  }

  async deployWebsite(
    subdomain: string,
    html: string,
    css: string,
    businessName: string,
  ): Promise<VercelDeploymentResult> {
    this.logger.log(`Starting Vercel deployment for: ${subdomain}`);
    const projectName = `ngmia-${subdomain}`.slice(0, 52).replace(/[^a-z0-9-]/g, '-');
    const projectId = await this.ensureProject(subdomain);
    const fullHtml = this.buildFullHtml(html, css, businessName);
    const sha1 = crypto.createHash('sha1').update(fullHtml).digest('hex');
    const fileSize = Buffer.byteLength(fullHtml, 'utf8');

    await fetch(this.appendTeam(`${this.baseUrl}/v2/files`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/octet-stream',
        'x-now-digest': sha1,
        'x-now-size': fileSize.toString(),
      },
      body: fullHtml,
    });

    const deployRes = await fetch(this.appendTeam(`${this.baseUrl}/v13/deployments`), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        name: projectName,
        target: 'production',
        files: [{ file: 'index.html', sha: sha1, size: fileSize }],
        projectSettings: { framework: null, buildCommand: null, outputDirectory: null, installCommand: null },
      }),
    });

    if (!deployRes.ok) {
      const err = await deployRes.text();
      throw new Error(`Vercel deployment failed: ${err}`);
    }

    const deployData = await deployRes.json();
    return {
      projectId,
      deploymentId: deployData.id,
      url: `https://${deployData.url}`,
      status: deployData.readyState === 'READY' ? 'READY' : 'BUILDING',
    };
  }

  async getDeploymentStatus(deploymentId: string): Promise<{ status: string; url?: string }> {
    const res = await fetch(this.appendTeam(`${this.baseUrl}/v13/deployments/${deploymentId}`), {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to get deployment status');
    const data = await res.json();
    return { status: data.readyState, url: data.url ? `https://${data.url}` : undefined };
  }

  private buildFullHtml(html: string, css: string, businessName: string): string {
    if (html.trim().toLowerCase().startsWith('<!doctype') || html.trim().toLowerCase().startsWith('<html')) {
      return css ? html.replace('</head>', `<style>${css}</style></head>`) : html;
    }
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${businessName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>body { font-family: 'Inter', sans-serif; } ${css || ''}</style>
</head>
<body>${html}</body>
</html>`;
  }
}
