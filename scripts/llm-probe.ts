/**
 * Prints exactly what the text model returns for the menu prompts, so the
 * schema can be debugged against reality rather than assumption.
 *
 *   npx ts-node scripts/llm-probe.ts
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AiEngineService } from '../src/modules/ai-engine/ai-engine.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const ai = app.get(AiEngineService);
  console.log(`modele: ${process.env.NVIDIA_NIM_TEXT_MODEL}\n`);

  const prompt = `Voici les plats de la carte d'une pizzeria.
Pour CHAQUE plat, donne ses etiquettes et la direction de sa photo.

Plats:
0. Margherita — San Marzano, mozzarella di bufala, basilic frais
1. Diavola — Nduja de Calabre, mozzarella, miel de chataignier
2. Ortolana — Courgettes, aubergines, poivrons grilles, stracciatella

Reponds UNIQUEMENT avec ce JSON, un objet par plat, dans le meme ordre:
{"items":[{"i":0,"badges":["Vegetarien"],"imagePrompt":"..."}]}

"badges": 0 a 2 etiquettes vraies d'apres les ingredients, prises dans:
"Vegetarien", "Vegan", "Epice", "Sans gluten", "De saison", "Fait maison".
"imagePrompt": une phrase EN ANGLAIS decrivant ce que montre la photo.`;

  const started = Date.now();
  const raw = await ai.generateText({
    prompt,
    tone: 'factuel',
    length: 'LONG',
    maxTokens: 4000,
    language: 'français',
  } as any);
  console.log(`--- brut (${((Date.now() - started) / 1000).toFixed(1)}s, ${raw.length} caracteres) ---`);
  console.log(raw.slice(0, 2500));
  console.log('--- fin ---\n');

  const parsed = ai.parseStrictJson(raw);
  console.log('parse:', parsed ? JSON.stringify(parsed).slice(0, 900) : 'ECHEC');

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
