#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLOUDFLARED_LOG = '/tmp/cloudflared.log';
const TUNNEL_URL_REGEX = /https:\/\/[^\s]*\.trycloudflare\.com/;

function log(message) {
	console.log(`[DEBUG-AUTO] ${message}`);
}

function cleanup() {
	log('Cleaning up...');
	// Kill cloudflared processes
	exec('pkill -f "cloudflared tunnel"', (error) => {
		if (error && !error.message.includes('No matching processes')) {
			console.warn('Warning: Could not kill cloudflared processes:', error.message);
		}
	});

	// Remove log file
	if (fs.existsSync(CLOUDFLARED_LOG)) {
		fs.unlinkSync(CLOUDFLARED_LOG);
	}
}

function startCloudflaredTunnel() {
	return new Promise((resolve, reject) => {
		log('Starting cloudflared tunnel...');

		// Clean up any existing log file
		if (fs.existsSync(CLOUDFLARED_LOG)) {
			fs.unlinkSync(CLOUDFLARED_LOG);
		}

		const cloudflared = spawn('cloudflared', ['tunnel', '--url', 'localhost:5678'], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		const logStream = fs.createWriteStream(CLOUDFLARED_LOG);
		cloudflared.stdout.pipe(logStream);
		cloudflared.stderr.pipe(logStream);

		cloudflared.on('error', (error) => {
			reject(new Error(`Failed to start cloudflared: ${error.message}`));
		});

		// Wait for tunnel URL to appear in logs
		let attempts = 0;
		const maxAttempts = 20;

		const checkForUrl = () => {
			attempts++;

			if (attempts > maxAttempts) {
				reject(new Error('Timeout waiting for tunnel URL'));
				return;
			}

			if (!fs.existsSync(CLOUDFLARED_LOG)) {
				setTimeout(checkForUrl, 500);
				return;
			}

			const logContent = fs.readFileSync(CLOUDFLARED_LOG, 'utf8');
			const match = logContent.match(TUNNEL_URL_REGEX);

			if (match) {
				const tunnelUrl = match[0];
				log(`Tunnel URL found: ${tunnelUrl}`);
				resolve({ tunnelUrl, process: cloudflared });
			} else {
				setTimeout(checkForUrl, 500);
			}
		};

		setTimeout(checkForUrl, 1000);
	});
}

function startN8n(tunnelUrl) {
	return new Promise((resolve, reject) => {
		const host = tunnelUrl.replace('https://', '');

		log(`Setting N8N_HOST=${host}`);
		log(`Setting WEBHOOK_URL=${tunnelUrl}`);

		const env = {
			...process.env,
			N8N_HOST: host,
			WEBHOOK_URL: tunnelUrl,
		};

		log('Starting n8n...');
		const n8n = spawn('n8n', [], {
			stdio: 'inherit',
			env: env,
		});

		n8n.on('error', (error) => {
			reject(new Error(`Failed to start n8n: ${error.message}`));
		});

		n8n.on('close', (code) => {
			log(`n8n exited with code ${code}`);
			resolve(code);
		});

		// Handle process termination
		process.on('SIGINT', () => {
			log('Received SIGINT, shutting down...');
			n8n.kill('SIGINT');
		});

		process.on('SIGTERM', () => {
			log('Received SIGTERM, shutting down...');
			n8n.kill('SIGTERM');
		});
	});
}

async function main() {
	try {
		log('Starting automated debug setup...');

		// Setup cleanup on exit
		process.on('exit', cleanup);
		process.on('SIGINT', () => {
			cleanup();
			process.exit(0);
		});
		process.on('SIGTERM', () => {
			cleanup();
			process.exit(0);
		});

		// Start cloudflared tunnel
		const { tunnelUrl, process: cloudflaredProcess } = await startCloudflaredTunnel();

		// Start n8n with environment variables
		await startN8n(tunnelUrl);
	} catch (error) {
		console.error(`Error: ${error.message}`);
		cleanup();
		process.exit(1);
	}
}

if (require.main === module) {
	main();
}

module.exports = { main };
