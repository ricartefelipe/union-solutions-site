/**
 * Endereço público de um arquivo de public/ com `?v=` e os primeiros caracteres do SHA-256 do conteúdo.
 * As capturas são servidas com cache longo e mantêm o nome quando uma tela é refeita: sem a versão no endereço, o
 * navegador continua mostrando a imagem antiga até o cache vencer. Com ela, o endereço muda junto com o arquivo.
 *
 * Lê o disco durante o build: use só no frontmatter dos componentes, nunca em scripts que vão para o navegador.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const versions = new Map<string, string>();

export function versioned(publicPath: string): string {
  let version = versions.get(publicPath);
  if (!version) {
    const content = readFileSync(join(process.cwd(), 'public', publicPath));
    version = createHash('sha256').update(content).digest('hex').slice(0, 10);
    versions.set(publicPath, version);
  }
  return `${publicPath}?v=${version}`;
}
