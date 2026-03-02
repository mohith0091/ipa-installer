# IPA Installer

Self-hosted OTA (Over-The-Air) iOS app distribution. Upload an IPA file, get a QR code and install link — let your team install iOS apps directly from Safari, no App Store needed.

## Features

- **Drag & drop upload** — Upload `.ipa` files up to 1 GB
- **Automatic metadata extraction** — Reads app name, bundle ID, version, and icon from the IPA
- **QR code generation** — Scan to install from any iOS device
- **OTA installation** — Uses Apple's `itms-services://` protocol for direct installation
- **CgBI PNG support** — Automatically converts Apple's optimized icons to standard PNG
- **Auto-cleanup** — Expired uploads are automatically removed (configurable retention)
- **Light & dark theme** — Adapts to system preference
- **Docker ready** — One command to deploy

## Requirements

- **HTTPS** — iOS requires HTTPS for OTA installation. Use a reverse proxy like Cloudflare Tunnel, Nginx + Let's Encrypt, or Caddy
- **Node.js 20+** (if running without Docker)

## Quick Start

### With Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/mohith0091/ipa-installer.git
cd ipa-installer

# Configure
cp .env.example .env
# Edit .env — set BASE_URL to your HTTPS domain

# Run
docker compose up -d
```

### Without Docker

```bash
# Clone and install
git clone https://github.com/mohith0091/ipa-installer.git
cd ipa-installer
npm install

# Configure
cp .env.example .env
# Edit .env — set BASE_URL to your HTTPS domain

# Build and run
npm run build
npm start
```

### Development

```bash
npm run start:dev
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `BASE_URL` | `http://localhost:3000` | Public HTTPS URL (used in manifests and QR codes) |
| `UPLOAD_DIR` | `./uploads` | Directory to store uploaded IPAs |
| `MAX_FILE_SIZE` | `1048576000` | Max upload size in bytes (default: 1 GB) |
| `RETENTION_HOURS` | `48` | Hours to keep uploads before auto-cleanup |

## How It Works

1. User uploads an `.ipa` file
2. Server extracts `Info.plist` from the IPA to read app metadata (name, bundle ID, version, icon)
3. A unique install link and QR code are generated
4. When an iOS user opens the link in Safari, the server generates an OTA manifest (XML plist) pointing to the IPA download
5. iOS downloads and installs the app via the `itms-services://` protocol

## Tech Stack

- **Backend** — NestJS (TypeScript)
- **IPA Parsing** — yauzl (ZIP), plist + bplist-parser (property lists), sharp (icon processing)
- **Frontend** — Vanilla HTML/CSS/JS
- **Containerization** — Docker with multi-stage build

## Project Structure

```
├── public/                  # Frontend (served as static files)
│   ├── index.html           # Upload page
│   ├── install.html         # Install page
│   ├── css/style.css        # iOS 26 inspired design
│   └── js/                  # Upload and install logic
├── src/
│   ├── main.ts              # NestJS bootstrap
│   ├── app.module.ts        # Root module
│   ├── upload/              # Upload module (controller, service, multer config)
│   ├── manifest/            # OTA manifest generation
│   ├── app-info/            # App info, icon, and download endpoints
│   ├── cleanup/             # Scheduled cleanup of expired uploads
│   └── services/            # IPA parser, manifest generator, QR generator
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## License

[MIT](LICENSE)
