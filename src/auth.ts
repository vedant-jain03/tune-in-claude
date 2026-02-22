import express from 'express';
import { getAuthUrl, exchangeCodeForToken } from './spotify';
import * as childProcess from 'child_process';

export async function startAuthFlow(): Promise<void> {
  const app = express();
  const PORT = 8888;

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      const authUrl = getAuthUrl();
      console.log('\n🎵 Opening Spotify authentication in your browser...\n');
      console.log('If the browser doesn\'t open automatically, visit:');
      console.log(`\n  ${authUrl}\n`);

      // Open browser
      const command = process.platform === 'darwin' ? 'open' :
                     process.platform === 'win32' ? 'start' : 'xdg-open';
      childProcess.exec(`${command} "${authUrl}"`);
    });

    app.get('/callback', async (req, res) => {
      const { code, error } = req.query;

      if (error) {
        const safeError = String(error)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        res.send(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>Authentication Failed</h1>
              <p>${safeError}</p>
              <p>You can close this window.</p>
            </body>
          </html>
        `);
        server.close();
        reject(new Error(`Authentication failed: ${safeError}`));
        return;
      }

      if (!code || typeof code !== 'string') {
        res.send(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>❌ No Authorization Code</h1>
              <p>You can close this window.</p>
            </body>
          </html>
        `);
        server.close();
        reject(new Error('No authorization code received'));
        return;
      }

      try {
        await exchangeCodeForToken(code);
        res.send(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>✅ Authentication Successful!</h1>
              <p>You can now close this window and return to your terminal.</p>
            </body>
          </html>
        `);
        server.close();
        resolve();
      } catch (err) {
        res.send(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>❌ Authentication Failed</h1>
              <p>Error exchanging code for token.</p>
              <p>You can close this window.</p>
            </body>
          </html>
        `);
        server.close();
        reject(err);
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}
