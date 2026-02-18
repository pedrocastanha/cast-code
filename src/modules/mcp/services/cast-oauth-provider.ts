import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { homedir } from 'os';
import { spawn } from 'child_process';
import type {
  OAuthClientProvider,
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/client/auth.js';

const CAST_AUTH_DIR = path.join(homedir(), '.cast', 'mcp-auth');

/**
 * Implements OAuthClientProvider for cast-code CLI.
 * Stores tokens and client info in ~/.cast/mcp-auth/<serverName>/
 */
export class CastOAuthProvider implements OAuthClientProvider {
  private readonly authDir: string;
  private readonly port: number;

  constructor(
    private readonly serverName: string,
    port = 18090,
  ) {
    this.authDir = path.join(CAST_AUTH_DIR, serverName);
    this.port = port;
    fs.mkdirSync(this.authDir, { recursive: true });
  }

  get redirectUrl(): string {
    return `http://127.0.0.1:${this.port}/callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Cast Code',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const file = path.join(this.authDir, 'client.json');
    if (!fs.existsSync(file)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return undefined;
    }
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    fs.writeFileSync(
      path.join(this.authDir, 'client.json'),
      JSON.stringify(info, null, 2),
    );
  }

  tokens(): OAuthTokens | undefined {
    const file = path.join(this.authDir, 'tokens.json');
    if (!fs.existsSync(file)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return undefined;
    }
  }

  saveTokens(tokens: OAuthTokens): void {
    fs.writeFileSync(
      path.join(this.authDir, 'tokens.json'),
      JSON.stringify(tokens, null, 2),
    );
  }

  redirectToAuthorization(url: URL): void {
    try {
      spawn('xdg-open', [url.toString()], { detached: true, stdio: 'ignore' }).unref();
    } catch {
      // Silently ignore if xdg-open is not available
    }
  }

  saveCodeVerifier(verifier: string): void {
    fs.writeFileSync(path.join(this.authDir, 'verifier.txt'), verifier);
  }

  codeVerifier(): string {
    const file = path.join(this.authDir, 'verifier.txt');
    if (!fs.existsSync(file)) throw new Error(`No PKCE code verifier saved for ${this.serverName}`);
    return fs.readFileSync(file, 'utf-8');
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): void {
    const remove = (name: string) => {
      const f = path.join(this.authDir, name);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    };
    if (scope === 'all' || scope === 'tokens') remove('tokens.json');
    if (scope === 'all' || scope === 'client') remove('client.json');
    if (scope === 'all' || scope === 'verifier') remove('verifier.txt');
  }

  /**
   * Starts a local HTTP server on the callback port.
   * Returns a Promise that resolves with the authorization code when the user
   * completes the OAuth flow in their browser.
   *
   * @param onListening Optional callback fired when the server is ready (before opening browser)
   */
  waitForCallback(onListening?: () => void): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        try {
          const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          const successHtml = `
            <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0fdf4">
              <h2 style="color:#16a34a">✅ Autenticação concluída!</h2>
              <p>Pode fechar esta aba e voltar ao terminal.</p>
            </body></html>`;

          const errorHtml = `
            <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#fef2f2">
              <h2 style="color:#dc2626">❌ Erro na autenticação</h2>
              <p>${error ?? 'Erro desconhecido'}</p>
            </body></html>`;

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

          if (code) {
            res.end(successHtml);
            server.close();
            resolve(code);
          } else {
            res.end(errorHtml);
            server.close();
            reject(new Error(`OAuth error: ${error ?? 'unknown'}`));
          }
        } catch (e) {
          server.close();
          reject(e);
        }
      });

      server.on('error', (err) => reject(err));
      server.listen(this.port, '127.0.0.1', () => {
        if (onListening) onListening();
      });
    });
  }
}
