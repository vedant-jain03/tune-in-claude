#!/usr/bin/env node

import { spawn } from 'child_process';
import { startAuthFlow } from './auth';
import { playSpotify, pauseSpotify } from './spotify';
import { isSpotifyRunning, playSpotifyNative, pauseSpotifyNative } from './spotify-native';
import { loadConfig, clearConfig } from './config';
import { TuneInDaemon, sendDaemonCommand, isDaemonRunning, stopDaemon } from './daemon';
import chalk from 'chalk';

function showHelp(): void {
  console.log(`
${chalk.bold('tune-in')} - Sync Spotify with your tasks

${chalk.bold('Basic Usage:')}
  tune-in <command>         Run command with music sync
  tune-in auth              Authenticate with Spotify Web API (optional)
  tune-in logout            Remove stored credentials

${chalk.bold('Daemon Mode (for Claude Code integration):')}
  tune-in daemon            Start background daemon
  tune-in signal start      Tell daemon to play music
  tune-in signal stop       Tell daemon to pause music
  tune-in daemon stop       Stop the daemon

${chalk.bold('Examples:')}
  tune-in npm run build
  tune-in sleep 10

${chalk.bold('Claude Code Integration:')}
  Run: tune-in daemon
  Then configure Claude Code hooks (see README)

${chalk.bold('How it works:')}
  • Task starts → Music plays 🎵
  • Task ends → Music pauses ⏸️
  `);
}

async function runCommand(args: string[]): Promise<void> {
  const command = args[0];
  const commandArgs = args.slice(1);

  console.log(chalk.dim(`\n▶️  Starting: ${args.join(' ')}\n`));

  // Check if Spotify Desktop is running
  const spotifyRunning = await isSpotifyRunning();
  let useLocalMode = spotifyRunning;

  // If Spotify Desktop not running, check for Web API auth
  if (!spotifyRunning) {
    const config = loadConfig();
    if (!config.accessToken || !config.refreshToken) {
      console.error(chalk.red('❌ Spotify not running and not authenticated with Web API.\n'));
      console.log('Two options:');
      console.log('  1. ' + chalk.cyan('Open Spotify Desktop') + ' (easier, no setup needed)');
      console.log('  2. Run ' + chalk.cyan('tune-in auth') + ' to use Web API\n');
      process.exit(1);
    }
    useLocalMode = false;
  }

  console.log(chalk.dim(`Mode: ${useLocalMode ? 'Spotify Desktop' : 'Web API'}\n`));

  // Start music
  let musicStarted = false;
  try {
    if (useLocalMode) {
      const success = await playSpotifyNative();
      if (success) {
        console.log(chalk.green('🎵 Music playing\n'));
        musicStarted = true;
      } else {
        console.log(chalk.yellow('⚠️  Could not start Spotify - make sure it\'s open\n'));
      }
    } else {
      await playSpotify();
      console.log(chalk.green('🎵 Music playing\n'));
      musicStarted = true;
    }
  } catch (error: any) {
    console.error(chalk.yellow(`⚠️  Could not start music: ${error.message}\n`));
  }

  // Run the command
  const child = spawn(command, commandArgs, {
    stdio: 'inherit',
    shell: true,
  });

  const pauseMusic = async () => {
    if (!musicStarted) return;

    try {
      if (useLocalMode) {
        await pauseSpotifyNative();
      } else {
        await pauseSpotify();
      }
      console.log(chalk.dim('\n⏸️  Music paused\n'));
    } catch (error: any) {
      console.error(chalk.yellow(`⚠️  Could not pause music: ${error.message}\n`));
    }
  };

  child.on('exit', async (code) => {
    await pauseMusic();
    process.exit(code || 0);
  });

  child.on('error', async (error) => {
    console.error(chalk.red(`\n❌ Error running command: ${error.message}\n`));
    await pauseMusic();
    process.exit(1);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', async () => {
    console.log(chalk.dim('\n\n⏸️  Task interrupted\n'));
    await pauseMusic();
    process.exit(130);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return;
  }

  const command = args[0];

  switch (command) {
    case 'auth':
      try {
        await startAuthFlow();
        console.log(chalk.green('\n✅ Successfully authenticated with Spotify!\n'));
        console.log('You can now run commands with: ' + chalk.cyan('tune-in <command>') + '\n');
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Authentication failed: ${error.message}\n`));
        process.exit(1);
      }
      break;

    case 'logout':
      clearConfig();
      console.log(chalk.green('\n✅ Logged out successfully\n'));
      break;

    case 'daemon':
      if (args[1] === 'stop') {
        stopDaemon();
      } else {
        const daemon = new TuneInDaemon();
        await daemon.start();
      }
      break;

    case 'signal':
      if (!args[1]) {
        console.error(chalk.red('\n❌ Usage: tune-in signal <start|stop>\n'));
        process.exit(1);
      }

      if (args[1] !== 'start' && args[1] !== 'stop') {
        console.error(chalk.red('\n❌ Signal must be "start" or "stop"\n'));
        process.exit(1);
      }

      try {
        await sendDaemonCommand(args[1]);
      } catch (error: any) {
        console.error(chalk.red(`\n❌ ${error.message}\n`));
        process.exit(1);
      }
      break;

    case 'status':
      try {
        const status = await sendDaemonCommand('status');
        const state = JSON.parse(status);
        console.log(chalk.bold('\n🎵 Daemon Status:\n'));
        console.log('  Playing:', state.playing ? chalk.green('Yes') : chalk.dim('No'));
        console.log('  Mode:', state.mode === 'native' ? chalk.cyan('Native (Spotify Desktop)') : chalk.cyan('Web API'));
        console.log('  Last update:', new Date(state.lastUpdate).toLocaleString());
        console.log();
      } catch (error: any) {
        console.error(chalk.red(`\n❌ ${error.message}\n`));
        process.exit(1);
      }
      break;

    default:
      await runCommand(args);
  }
}

main().catch((error) => {
  console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
  process.exit(1);
});
