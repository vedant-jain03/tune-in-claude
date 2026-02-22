#!/usr/bin/env node

import * as pty from 'node-pty';
import { isSpotifyRunning, openSpotify, playSpotifyNative, pauseSpotifyNative, getCurrentTrack } from './spotify-native';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
// Temp file storing the PID of the claude process we manage.
// Hook commands check $PPID against this so they only fire for OUR instance,
// not for any other `claude` session the user has open simultaneously.
const PID_FILE = path.join(os.tmpdir(), 'tune-in-claude.pid');

// How many printable chars before music plays while typing
const TYPING_PLAY_THRESHOLD = 3;
// How long to pause before music stops when you stop typing
const TYPING_IDLE_MS = 6000;

// Each hook command prefixes a PPID guard so it only fires from the claude
// process we spawned, not from any other concurrent Claude Code sessions.
function spotifyPlayCmd(pidFile: string): string {
  const guard = `[ "$(cat '${pidFile}' 2>/dev/null)" = "$PPID" ] && `;
  if (process.platform === 'darwin')
    return `${guard}osascript -e 'tell application "Spotify" to play'`;
  if (process.platform === 'win32')
    return `${guard}powershell -command "(New-Object -ComObject WMPlayer.OCX.7).controls.play()"`;
  return `${guard}dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Play`;
}

function spotifyPauseCmd(pidFile: string): string {
  const guard = `[ "$(cat '${pidFile}' 2>/dev/null)" = "$PPID" ] && `;
  if (process.platform === 'darwin')
    return `${guard}osascript -e 'tell application "Spotify" to pause'`;
  if (process.platform === 'win32')
    return `${guard}powershell -command "(New-Object -ComObject WMPlayer.OCX.7).controls.pause()"`;
  return `${guard}dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Pause`;
}

function readSettings(): any {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); }
  catch { return {}; }
}

function writeSettings(obj: any) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(obj, null, 2));
}

function injectHooks(noPause: boolean, pidFile: string): any {
  const original = readSettings();
  const updated = JSON.parse(JSON.stringify(original));
  updated.hooks = updated.hooks ?? {};

  // PreToolUse: Claude starts working → play
  updated.hooks.PreToolUse = updated.hooks.PreToolUse ?? [];
  updated.hooks.PreToolUse.push({
    _tuneIn: true,
    hooks: [{ type: 'command', command: spotifyPlayCmd(pidFile) }],
  });

  // Stop: Claude finishes turn → pause
  // Notification: Claude needs mid-turn input (permission dialogs, selectors) → pause
  if (!noPause) {
    updated.hooks.Stop = updated.hooks.Stop ?? [];
    updated.hooks.Stop.push({
      _tuneIn: true,
      hooks: [{ type: 'command', command: spotifyPauseCmd(pidFile) }],
    });

    updated.hooks.Notification = updated.hooks.Notification ?? [];
    updated.hooks.Notification.push({
      _tuneIn: true,
      hooks: [{ type: 'command', command: spotifyPauseCmd(pidFile) }],
    });
  }

  writeSettings(updated);
  return original;
}

function restoreHooks(original: any) {
  writeSettings(original);
}

async function main() {
  const args = process.argv.slice(2);
  const noPauseMode = args.includes('--no-pause');
  const claudeArgs = args.filter(a => a !== '--no-pause');

  let spotifyAvailable = await isSpotifyRunning();
  if (!spotifyAvailable) {
    console.log(chalk.yellow('⚠️  Spotify not running — attempting to open...\n'));
    await openSpotify();
    spotifyAvailable = await isSpotifyRunning();
    if (!spotifyAvailable)
      console.log(chalk.yellow('⚠️  Could not open Spotify — music control disabled\n'));
  }

  if (noPauseMode) {
    console.log(chalk.green('🎵 Continuous vibe mode enabled!'));
    console.log(chalk.dim('   Music plays non-stop until you exit\n'));
  } else {
    console.log(chalk.green('🎵 Vibe-coding mode enabled!'));
    console.log(chalk.dim('   Music plays while Claude is thinking'));
    console.log(chalk.dim('   Music pauses when Claude needs your input\n'));
  }

  // Start music immediately
  if (spotifyAvailable) {
    try {
      await playSpotifyNative();
      const track = await getCurrentTrack();
      if (track) {
        console.log(chalk.green(`🎵 Now playing: ${chalk.bold(track.name)}`) + chalk.dim(` by ${track.artist}`) + '\n');
      } else {
        console.log(chalk.yellow('⚠️  Spotify is open but no track is loaded — open a playlist in Spotify first\n'));
      }
    } catch {
      console.log(chalk.yellow('⚠️  Could not start music playback\n'));
    }
  }

  // Spawn Claude inside a real PTY — it gets a full TTY, we see every keystroke.
  // Spawn BEFORE injecting hooks so we have the PID to embed in hook commands.
  let claude: ReturnType<typeof pty.spawn>;
  try {
    claude = pty.spawn('claude', claudeArgs, {
      name: process.env.TERM || 'xterm-256color',
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
      cwd: process.cwd(),
      env: { ...process.env },
    });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.error(chalk.red('Error: claude command not found.'));
      console.error(chalk.dim('Install Claude Code: https://claude.ai/code'));
    } else {
      console.error(chalk.red(`Error: failed to start claude — ${err.message}`));
    }
    process.exit(1);
  }

  // Write the managed claude's PID so hook commands can filter by $PPID
  fs.writeFileSync(PID_FILE, String(claude.pid));

  const originalSettings = injectHooks(noPauseMode, PID_FILE);

  // ── State ────────────────────────────────────────────────────────────────
  let firstMessageSent = false;
  let charCount = 0;
  let typingTimer: NodeJS.Timeout | null = null;
  // ─────────────────────────────────────────────────────────────────────────

  // Forward PTY output straight to terminal
  claude.onData((data: string) => {
    process.stdout.write(data);
  });

  // Resize PTY when terminal window changes
  process.stdout.on('resize', () => {
    claude.resize(process.stdout.columns || 80, process.stdout.rows || 24);
  });

  const onTypingPlay = () => {
    if (noPauseMode || !spotifyAvailable) return;
    playSpotifyNative().catch(() => {});
  };

  const scheduleTypingPause = () => {
    if (typingTimer) clearTimeout(typingTimer);
    if (noPauseMode || !spotifyAvailable) return;
    typingTimer = setTimeout(() => {
      typingTimer = null;
      charCount = 0;
      pauseSpotifyNative().catch(() => {});
    }, TYPING_IDLE_MS);
  };

  // Forward our stdin to the PTY
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on('data', (data: Buffer) => {
    claude.write(data.toString());

    const bytes = Array.from(data);

    // Enter key — user submitted a message or confirmed a selector.
    // Play immediately so music starts while Claude is thinking,
    // without waiting for the PreToolUse hook to fire.
    if (bytes.includes(0x0d) || bytes.includes(0x0a)) {
      firstMessageSent = true;
      charCount = 0;
      if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; }
      if (spotifyAvailable && !noPauseMode) playSpotifyNative().catch(() => {});
      return;
    }

    // Only track typing after the first message (skip onboarding prompt)
    if (!firstMessageSent) return;

    // Only count printable characters; ignore arrows, backspace, etc.
    const printable = bytes.filter(b => b >= 0x20 && b < 0x7f);
    if (printable.length === 0) return;

    charCount += printable.length;

    // Once threshold is reached, play music
    if (charCount === TYPING_PLAY_THRESHOLD) {
      onTypingPlay();
    }

    // Keep resetting the idle timer as long as user keeps typing
    if (charCount >= TYPING_PLAY_THRESHOLD) {
      scheduleTypingPause();
    }
  });

  const cleanup = async () => {
    if (typingTimer) clearTimeout(typingTimer);
    try { fs.unlinkSync(PID_FILE); } catch {}
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    restoreHooks(originalSettings);
    if (spotifyAvailable) await pauseSpotifyNative().catch(() => {});
  };

  claude.onExit(async ({ exitCode }) => {
    await cleanup();
    process.exit(exitCode ?? 0);
  });

  process.on('SIGINT', async () => {
    claude.kill('SIGINT');
    await cleanup();
    process.exit(130);
  });
}

main().catch((err) => {
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
});
