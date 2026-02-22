# tune-in-claude

**Vibe-code with Claude. Music plays while Claude thinks, pauses when it's your turn.**

```bash
npm install -g tune-in-claude
tune-in-claude
```

That's it.

## What it does

`tune-in-claude` wraps [Claude Code](https://claude.ai/code) and syncs your Spotify playback to Claude's activity:

- **Claude is thinking / using tools** → music plays 🎵
- **Claude needs your input** → music pauses ⏸️
- **You start typing** → music plays again 🎵
- **You stop typing for 6 seconds** → music pauses (you're thinking!)

You always know what Claude is doing without looking at the screen.

## Requirements

- [Claude Code](https://claude.ai/code) installed and on your PATH (`claude` command)
- [Spotify Desktop](https://www.spotify.com/download/) open with something playing
- macOS (Windows/Linux have limited support via native media controls)

## Installation

```bash
npm install -g tune-in-claude
```

## Usage

```bash
# Drop-in replacement for `claude`
tune-in-claude

# Pass any Claude Code arguments
tune-in-claude --model claude-opus-4-5
tune-in-claude --resume

# Continuous mode: music plays non-stop (no pause on your turn)
tune-in-claude --no-pause
```

## How it works

Under the hood, `tune-in-claude`:

1. Opens Spotify if it isn't running
2. Starts music immediately
3. Injects Claude Code [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) into `~/.claude/settings.json`:
   - `PreToolUse` → plays music (Claude is working)
   - `Stop` → pauses music (Claude needs input)
4. Spawns `claude` in a PTY so the full interactive TUI works normally
5. Watches your keystrokes: typing starts music, 6s of silence pauses it
6. Restores your original `~/.claude/settings.json` on exit

No Spotify account changes. No persistent modifications. Everything reverts cleanly when you quit.

## Also included: `tune-in` (general command wrapper)

```bash
# Play music while any command runs, pause when it's done
tune-in npm run build
tune-in pytest tests/
tune-in cargo build --release
```

### Optional: Spotify Web API mode

By default, music control uses native OS commands (AppleScript on macOS). For remote device control or more reliable playback, you can use the Spotify Web API:

1. Create a Spotify app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   - Add redirect URI: `http://localhost:8888/callback`
2. Set environment variables:
   ```bash
   export SPOTIFY_CLIENT_ID="your_id"
   export SPOTIFY_CLIENT_SECRET="your_secret"
   ```
3. Authenticate once:
   ```bash
   tune-in auth
   ```

Requires Spotify Premium for playback control via Web API.

## Troubleshooting

**Music doesn't start**
Make sure Spotify Desktop is open and a song is loaded (play one manually first).

**`claude` command not found**
Install Claude Code: [claude.ai/code](https://claude.ai/code)

**Music doesn't pause when Claude needs input**
The `Stop` hook requires Claude Code version that supports hooks. Update Claude Code with `claude update`.

## License

MIT © Vedant Jain
