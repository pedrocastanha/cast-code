import { Injectable } from '@nestjs/common';
import * as http from 'http';
import * as url from 'url';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { ConfigManagerService } from '../../config/services/config-manager.service';
import { getRemoteHtml } from '../views/remote-ui';
import { Colors } from '../../repl/utils/theme';

@Injectable()
export class RemoteServerService {
    private server: http.Server | null = null;
    private port = 3334;
    private clients: http.ServerResponse[] = [];
    private authToken: string | null = null;
    private isRunning = false;
    private ngrokProcess: any = null;
    private messageCallback: ((msg: string) => Promise<void>) | null = null;

    constructor(private readonly configManager: ConfigManagerService) { }

    public onMessage(callback: (msg: string) => Promise<void>) {
        this.messageCallback = callback;
    }

    public broadcast(chunk: string) {
        if (!this.isRunning) return;
        const payload = JSON.stringify({ type: 'stdout', content: chunk });
        for (const res of this.clients) {
            res.write(`data: ${payload}\n\n`);
        }
    }

    async start(): Promise<void> {
        if (this.isRunning) {
            console.log(chalk.yellow(`\n⚠️  Servidor Remoto já está rodando na porta ${this.port}`));
            return;
        }

        await this.configManager.loadConfig();
        const config = this.configManager.getConfig();

        if (!config.remote?.enabled) {
            console.log(chalk.red(`\n❌ Acesso Remoto não está habilitado. Habilite em 'cast config'.\n`));
            return;
        }

        if (!config.remote.password) {
            console.log(chalk.red(`\n❌ Senha de acesso remoto não configurada.\n`));
            return;
        }

        this.authToken = crypto.randomBytes(32).toString('hex');
        this.isRunning = true;

        this.server = http.createServer((req, res) => this.handleRequest(req, res));
        this.server.listen(this.port, '0.0.0.0', () => {
            console.log(`${Colors.cyan}📡 Servidor Remoto Local Iniciado na porta ${this.port}${Colors.reset}`);
            this.startNgrok();
        });
    }

    private startNgrok() {
        const config = this.configManager.getConfig();
        process.stdout.write(`${Colors.dim}  Iniciando ngrok tunelamento...${Colors.reset}\r\n`);

        const ngrokArgs = ['--yes', 'ngrok', 'http', this.port.toString()];
        if (config.remote?.ngrokAuthToken) {
            ngrokArgs.push('--authtoken', config.remote.ngrokAuthToken);
        }

        this.ngrokProcess = spawn('npx', ngrokArgs, {
            stdio: 'pipe',
        });

        this.ngrokProcess.stderr.on('data', (data: any) => {
            process.stdout.write(`${Colors.yellow}ngrok stderr: ${data.toString()}${Colors.reset}`);
        });

        // Check ngrok's local API to get the public URL (default is usually port 4040)
        let tries = 0;
        const interval = setInterval(async () => {
            tries++;
            try {
                const resp = await fetch('http://127.0.0.1:4040/api/tunnels');
                const data = await resp.json() as any;
                if (data && data.tunnels && data.tunnels.length > 0) {
                    const tunnel = data.tunnels[0].public_url;
                    clearInterval(interval);
                    process.stdout.write(`\r\n${Colors.green}${Colors.bold}🌐 Acesso Remoto Online!${Colors.reset}\r\n`);
                    process.stdout.write(`${Colors.bold}Link:${Colors.reset} ${Colors.cyan}${tunnel}${Colors.reset}\r\n`);
                    process.stdout.write(`${Colors.bold}Senha:${Colors.reset} ${this.configManager.getConfig().remote?.password}\r\n\r\n`);
                    process.stdout.write(`${Colors.dim}Acesse pelo celular ou outro computador para controlar a CLI.${Colors.reset}\r\n`);
                }
            } catch (err) {
                if (tries > 15) {
                    clearInterval(interval);
                    process.stdout.write(`${Colors.yellow}  Falha ao obter URL pública do ngrok. O ngrok pode não estar instalado ou aberto.${Colors.reset}\r\n`);
                }
            }
        }, 1000);

        this.ngrokProcess.on('error', (err: any) => {
            console.log(`${Colors.red}  Erro no ngrok: ${err.message}${Colors.reset}`);
            clearInterval(interval);
        });
    }

    public stop() {
        if (this.ngrokProcess) {
            this.ngrokProcess.kill();
        }
        if (this.server) {
            this.server.close();
        }
        for (const res of this.clients) {
            res.end();
        }
        this.clients = [];
        this.isRunning = false;
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const reqUrl = req.url || '/';
        const host = req.headers.host || 'localhost';
        const parsedUrl = new URL(reqUrl, `http://${host}`);
        const method = req.method;

        if (parsedUrl.pathname === '/' && method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(getRemoteHtml());
            return;
        }

        if (parsedUrl.pathname === '/api/auth' && method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const expectedPwd = this.configManager.getConfig().remote?.password;

                    if (expectedPwd && data.password === expectedPwd) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ token: this.authToken }));
                    } else {
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid password' }));
                    }
                } catch {
                    res.writeHead(400);
                    res.end();
                }
            });
            return;
        }

        if (parsedUrl.pathname === '/api/events' && method === 'GET') {
            const token = parsedUrl.searchParams.get('token');
            if (token !== this.authToken) {
                res.writeHead(401);
                res.end();
                return;
            }

            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });

            this.clients.push(res);

            req.on('close', () => {
                this.clients = this.clients.filter(client => client !== res);
            });
            return;
        }

        const authHeader = req.headers['authorization'];
        if (!authHeader || authHeader !== `Bearer ${this.authToken}`) {
            res.writeHead(401);
            res.end();
            return;
        }

        if (parsedUrl.pathname === '/api/message' && method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    if (data.message && this.messageCallback) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true }));
                        // Executando no main stack pra soltar a resposta http rapido
                        setTimeout(() => {
                            if (this.messageCallback) this.messageCallback(data.message);
                        }, 50);
                    } else {
                        res.writeHead(400);
                        res.end();
                    }
                } catch {
                    res.writeHead(400);
                    res.end();
                }
            });
            return;
        }

        if (parsedUrl.pathname === '/api/audio' && method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const base64Data = data.audioBase64;
                    if (!base64Data) {
                        res.writeHead(400);
                        return res.end(JSON.stringify({ error: 'No audio provided' }));
                    }

                    const config = this.configManager.getConfig();
                    const openaiKey = config.remote?.openaiApiKey;
                    if (!openaiKey) {
                        this.broadcast('Audio error: No OpenAI API key configured for Whisper.\n');
                        res.writeHead(400);
                        return res.end(JSON.stringify({ error: 'No OpenAI API key' }));
                    }

                    this.broadcast('Processando áudio (Whisper)...\n');

                    // Extract base64 without the header "data:audio/webm;base64,"
                    const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
                    if (!matches || matches.length !== 3) {
                        throw new Error('Formato base64 inválido.');
                    }
                    const buffer = Buffer.from(matches[2], 'base64');

                    // Write to temp file
                    const tmpFilePath = path.join(os.tmpdir(), `cast_audio_${Date.now()}.webm`);
                    fs.writeFileSync(tmpFilePath, buffer);

                    try {
                        // Using fetch to raw OpenAI API
                        const formData = new FormData();
                        const fileBlob = new Blob([buffer], { type: 'audio/webm' });
                        formData.append('file', fileBlob, 'audio.webm');
                        formData.append('model', 'whisper-1');

                        const openaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${openaiKey}`
                            },
                            body: formData as any
                        });

                        if (!openaiRes.ok) {
                            const err = await openaiRes.text();
                            throw new Error(err);
                        }

                        const openaiData = await openaiRes.json() as any;
                        const text = openaiData.text;

                        fs.unlinkSync(tmpFilePath);

                        res.writeHead(200);
                        res.end(JSON.stringify({ text }));

                        // Envia como mensagem para o REPL se text nao for vazio
                        if (text && text.trim().length > 0) {
                            this.broadcast(`\x1b[36m> [Áudio Transcrito]: ${text}\x1b[0m\n`);
                            setTimeout(() => {
                                if (this.messageCallback) this.messageCallback(text.trim());
                            }, 50);
                        }

                    } catch (tErr: any) {
                        if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath);
                        this.broadcast(`Audio error fallback: ${tErr.message}\n`);
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: tErr.message }));
                    }

                } catch (err: any) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }

        res.writeHead(404);
        res.end();
    }
}
