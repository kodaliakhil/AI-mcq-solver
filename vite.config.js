import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// basicSsl gives you https on your LAN IP, which phones REQUIRE for camera access.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: { host: true, https: true },
});
