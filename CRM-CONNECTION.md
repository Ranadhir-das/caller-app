# Connect to aspiring-crm

1. Start the CRM from `E:\react\aspiring-crm`:

   ```powershell
   .\venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
   ```

2. In `caller-app/.env.local`, set the CRM address:

   ```dotenv
   EXPO_PUBLIC_API_BASE_URL=http://10.58.15.62:8000/api/v1
   ```

3. From `E:\react\caller-app`, run `npm start -- --clear`, open the development app, and sign in with a CRM caller account. Leads assigned to that account load after login.

The phone must be able to reach this computer over the local network. If the computer's IP changes, update `.env.local` and the CRM's `ALLOWED_HOSTS` environment variable (comma-separated hostnames/IPs without ports), then restart both servers. For the Android emulator, the host computer is available at `10.0.2.2`; add that address to `ALLOWED_HOSTS` when using it.

The CRM permits web requests from port 8081 on localhost and the configured development IP. For other web origins, set `CORS_ALLOWED_ORIGINS` in the CRM `.env` to a comma-separated list of full origins. Native mobile requests do not need CORS.

To check reachability, open `http://10.58.15.62:8000/api/v1/mobile/me/` on the phone. An authentication error means the API is reachable; a connection error means the server, network, or firewall needs attention. Allow inbound TCP port 8000 on the private network if Windows Firewall blocks it.

The URL is public app configuration; never put passwords or tokens in `EXPO_PUBLIC_` variables. Use an HTTPS CRM URL for production builds.
