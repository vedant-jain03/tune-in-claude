import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isSpotifyRunning, playSpotifyNative, pauseSpotifyNative, getSpotifyState } from './spotify-native';
import { playSpotify, pauseSpotify } from './spotify';
import { loadConfig } from './config';

const DAEMON_DIR = path.join(os.homedir(), '.tune-in');
const PID_FILE = path.join(DAEMON_DIR, 'daemon.pid');
const STATE_FILE = path.join(DAEMON_DIR, 'daemon.state');
const SOCKET_FILE = path.join(DAEMON_DIR, 'daemon.sock');

interface DaemonState {
  playing: boolean;
  mode: 'native' | 'web-api';
  lastUpdate: number;
}

export class TuneInDaemon {
  private state: DaemonState;
  private checkInterval?: NodeJS.Timeout;

  constructor() {
    this.state = {
      playing: false,
      mode: 'native',
      lastUpdate: Date.now()
    };
  }

  async start(): Promise<void> {
    // Check if daemon is already running
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
      try {
        process.kill(pid, 0); // Check if process exists
        console.error('Daemon already running with PID:', pid);
        process.exit(1);
      } catch {
        // Process doesn't exist, remove stale PID file
        fs.unlinkSync(PID_FILE);
      }
    }

    // Write PID file
    fs.writeFileSync(PID_FILE, process.pid.toString());

    // Determine mode
    const spotifyRunning = await isSpotifyRunning();
    const config = loadConfig();
    const hasWebAPI = !!(config.accessToken && config.refreshToken);

    if (spotifyRunning) {
      this.state.mode = 'native';
      console.log('🎵 Daemon started (Native Mode - Spotify Desktop)');
    } else if (hasWebAPI) {
      this.state.mode = 'web-api';
      console.log('🎵 Daemon started (Web API Mode)');
    } else {
      console.error('❌ Neither Spotify Desktop nor Web API available');
      process.exit(1);
    }

    console.log('Listening for Claude Code events...\n');

    // Create Unix socket for IPC
    this.setupSocket();

    // Keep alive
    this.checkInterval = setInterval(() => {
      this.saveState();
    }, 5000);

    // Handle shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private setupSocket(): void {
    const net = require('net');

    // Remove old socket
    if (fs.existsSync(SOCKET_FILE)) {
      fs.unlinkSync(SOCKET_FILE);
    }

    const server = net.createServer((socket: any) => {
      socket.on('data', async (data: Buffer) => {
        const command = data.toString().trim();

        if (command === 'start') {
          await this.handleStart();
          socket.write('OK\n');
        } else if (command === 'stop') {
          await this.handleStop();
          socket.write('OK\n');
        } else if (command === 'status') {
          socket.write(JSON.stringify(this.state) + '\n');
        }

        socket.end();
      });
    });

    server.listen(SOCKET_FILE);
  }

  async handleStart(): Promise<void> {
    if (this.state.playing) {
      return; // Already playing
    }

    try {
      if (this.state.mode === 'native') {
        await playSpotifyNative();
      } else {
        await playSpotify();
      }

      this.state.playing = true;
      this.state.lastUpdate = Date.now();
      console.log(`[${new Date().toLocaleTimeString()}] ▶️  Music started`);
    } catch (error: any) {
      console.error('Failed to start music:', error.message);
    }
  }

  async handleStop(): Promise<void> {
    if (!this.state.playing) {
      return; // Already stopped
    }

    try {
      if (this.state.mode === 'native') {
        await pauseSpotifyNative();
      } else {
        await pauseSpotify();
      }

      this.state.playing = false;
      this.state.lastUpdate = Date.now();
      console.log(`[${new Date().toLocaleTimeString()}] ⏸️  Music paused`);
    } catch (error: any) {
      console.error('Failed to pause music:', error.message);
    }
  }

  private saveState(): void {
    fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  private shutdown(): void {
    console.log('\n🛑 Shutting down daemon...');

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Pause music on shutdown
    if (this.state.playing) {
      if (this.state.mode === 'native') {
        pauseSpotifyNative();
      } else {
        pauseSpotify();
      }
    }

    // Cleanup
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
    if (fs.existsSync(SOCKET_FILE)) {
      fs.unlinkSync(SOCKET_FILE);
    }
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }

    process.exit(0);
  }
}

export async function sendDaemonCommand(command: 'start' | 'stop' | 'status'): Promise<string> {
  const net = require('net');

  return new Promise((resolve, reject) => {
    const client = net.createConnection(SOCKET_FILE, () => {
      client.write(command);
    });

    let response = '';
    client.on('data', (data: Buffer) => {
      response += data.toString();
    });

    client.on('end', () => {
      resolve(response.trim());
    });

    client.on('error', (error: Error) => {
      reject(new Error('Daemon not running. Start it with: tune-in daemon'));
    });
  });
}

export function isDaemonRunning(): boolean {
  if (!fs.existsSync(PID_FILE)) {
    return false;
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function stopDaemon(): void {
  if (!fs.existsSync(PID_FILE)) {
    console.log('Daemon is not running');
    return;
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
  try {
    process.kill(pid, 'SIGTERM');
    console.log('✅ Daemon stopped');
  } catch {
    console.log('Daemon not running (removing stale PID file)');
    fs.unlinkSync(PID_FILE);
  }
}
