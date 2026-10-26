# WhatsApp Chat Dashboard (Testing)

All source files are in the project root. This is a small, unofficial Baileys-based dashboard for an account you own or are authorized to use.

## Features

- QR pairing display
- Connection status
- Basic chat list and contact list
- In-memory message previews and real-time updates
- Plain-text message sending to a selected chat
- Responsive layout

## Requirements

- Node.js 20 or newer
- npm
- Internet connection

## Run locally

From this folder (the one containing `package.json`):

```bash
npm install
npm start
```

Open `http://127.0.0.1:3000` in your browser. On your phone, open WhatsApp → Linked devices → Link a device and scan the QR code.

## Notes / limitations

- This is not a full WhatsApp Web replacement. It is a testing scaffold; history synchronization is limited and this code keeps recent message previews in memory only. Restarting the process clears the in-memory chat/message lists.
- Contact and chat events vary by Baileys/WhatsApp version. Some contacts or historical conversations may not appear until messages or events are received.
- Media, voice notes, document downloads, group management, message status/read receipts, pagination, multi-user login, and production-grade database persistence are not implemented.
- API behavior may change in newer Baileys releases. Consult the upstream Baileys documentation if a release changes event names or APIs.
- Baileys is unofficial and may carry account or terms risks. Use only with your own/authorized account.

## Security warning before public hosting

This demo intentionally binds to `127.0.0.1` by default and has no user authentication. Do not expose it directly to the public internet. Before hosting publicly, add proper authentication, per-user session isolation, HTTPS, request protection/rate limits, and persistent private storage. Never publish `auth_info_baileys/`, QR codes, or session credentials.

## Pairing reset

If WhatsApp logs the session out, stop the server, remove the `auth_info_baileys` folder, then restart the server to generate a new QR code. Removing that folder signs out this local linked session.
