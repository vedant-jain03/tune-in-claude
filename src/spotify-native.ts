import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if Spotify Desktop is running
 */
export async function isSpotifyRunning(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      // macOS - check if Spotify is running
      const { stdout } = await execAsync(
        'osascript -e \'tell application "System Events" to (name of processes) contains "Spotify"\''
      );
      return stdout.trim() === 'true';
    } else if (process.platform === 'win32') {
      // Windows
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq Spotify.exe"');
      return stdout.includes('Spotify.exe');
    } else {
      // Linux
      const { stdout } = await execAsync('pgrep -x spotify');
      return stdout.trim().length > 0;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Open Spotify application
 */
export async function openSpotify(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      // macOS - open Spotify
      await execAsync('open -a Spotify');
      // Wait for Spotify to launch
      await new Promise(resolve => setTimeout(resolve, 3000));
      return true;
    } else if (process.platform === 'win32') {
      // Windows - open Spotify
      await execAsync('start spotify:');
      await new Promise(resolve => setTimeout(resolve, 3000));
      return true;
    } else {
      // Linux - open Spotify
      await execAsync('spotify &');
      await new Promise(resolve => setTimeout(resolve, 3000));
      return true;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Play Spotify using native OS controls
 */
export async function playSpotifyNative(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      // macOS - use AppleScript
      await execAsync('osascript -e \'tell application "Spotify" to play\'');
      return true;
    } else if (process.platform === 'win32') {
      // Windows - use PowerShell (works with Spotify media controls)
      await execAsync(
        'powershell -command "(New-Object -ComObject WMPlayer.OCX.7).controls.play()"'
      );
      return true;
    } else {
      // Linux - use D-Bus
      await execAsync('dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Play');
      return true;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Pause Spotify using native OS controls
 */
export async function pauseSpotifyNative(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      // macOS - use AppleScript
      await execAsync('osascript -e \'tell application "Spotify" to pause\'');
      return true;
    } else if (process.platform === 'win32') {
      // Windows
      await execAsync(
        'powershell -command "(New-Object -ComObject WMPlayer.OCX.7).controls.pause()"'
      );
      return true;
    } else {
      // Linux - use D-Bus
      await execAsync('dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Pause');
      return true;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Get current track info from Spotify
 */
export async function getCurrentTrack(): Promise<{ name: string; artist: string } | null> {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execAsync(
        `osascript -e 'tell application "Spotify" to (get name of current track) & " — " & (get artist of current track)'`
      );
      const trimmed = stdout.trim();
      const sepIdx = trimmed.indexOf(' — ');
      if (sepIdx !== -1) {
        return { name: trimmed.slice(0, sepIdx), artist: trimmed.slice(sepIdx + 3) };
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Get current Spotify playback state
 */
export async function getSpotifyState(): Promise<'playing' | 'paused' | 'unknown'> {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execAsync(
        'osascript -e \'tell application "Spotify" to player state as string\''
      );
      const state = stdout.trim().toLowerCase();
      if (state.includes('playing')) return 'playing';
      if (state.includes('paused')) return 'paused';
    }
  } catch (error) {
    // Ignore errors
  }
  return 'unknown';
}
