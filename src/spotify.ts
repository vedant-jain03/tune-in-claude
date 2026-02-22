import axios from "axios";
import { loadConfig, saveConfig, Config } from "./config";

// Spotify credentials - set via environment variables or update here
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "your_client_id_here";
const CLIENT_SECRET =
  process.env.SPOTIFY_CLIENT_SECRET || "your_client_secret_here";
const REDIRECT_URI = "http://localhost:8888/callback";

export const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
];

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(" "),
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<void> {
  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );

  const { access_token, refresh_token, expires_in } = response.data;
  const config: Config = {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: Date.now() + expires_in * 1000,
  };

  saveConfig(config);
}

async function refreshAccessToken(): Promise<string> {
  const config = loadConfig();
  if (!config.refreshToken) {
    throw new Error("No refresh token available. Please run: tune-in auth");
  }

  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );

  const { access_token, expires_in } = response.data;
  config.accessToken = access_token;
  config.expiresAt = Date.now() + expires_in * 1000;
  saveConfig(config);

  return access_token;
}

async function getValidAccessToken(): Promise<string> {
  const config = loadConfig();

  if (!config.accessToken || !config.refreshToken) {
    throw new Error("Not authenticated. Please run: tune-in auth");
  }

  // Refresh if token expires in less than 5 minutes
  if (!config.expiresAt || config.expiresAt < Date.now() + 5 * 60 * 1000) {
    return await refreshAccessToken();
  }

  return config.accessToken;
}

export async function playSpotify(): Promise<void> {
  const token = await getValidAccessToken();

  try {
    await axios.put(
      "https://api.spotify.com/v1/me/player/play",
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.warn(
        "⚠️  No active Spotify device found. Please open Spotify on any device.",
      );
    } else if (error.response?.status === 403) {
      console.warn("⚠️  Cannot play - Spotify Premium required.");
    } else {
      throw error;
    }
  }
}

export async function pauseSpotify(): Promise<void> {
  const token = await getValidAccessToken();

  try {
    await axios.put(
      "https://api.spotify.com/v1/me/player/pause",
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  } catch (error: any) {
    if (error.response?.status === 404) {
      // No active device - that's fine, nothing to pause
    } else if (error.response?.status === 403) {
      // Premium required - already shown during play
    } else {
      throw error;
    }
  }
}
