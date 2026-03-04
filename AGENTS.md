# AGENTS.md

## Project Overview

**ipa-installer** — A self-hosted OTA (Over-The-Air) iOS app installer built with NestJS.
Users upload `.ipa` files; the server parses metadata, extracts icons, generates an
OTA install manifest and QR code, and serves an install page. Expired uploads are
cleaned up on a cron schedule.

- **Runtime:** Node.js 20, TypeScript 5.7, NestJS 10
- **Module system:** CommonJS (`"module": "commonjs"`, target ES2021)
- **No database** — file-based storage in `uploads/` directory

## Repository Structure

```
src/
├── main.ts                           # Bootstrap (NestExpressApplication)
├── app.module.ts                     # Root module (ConfigModule, ScheduleModule, ServeStaticModule)
├── config/app.config.ts              # registerAs('app', ...) — reads env vars
├── upload/
│   ├── upload.module.ts              # MulterModule + providers
│   ├── upload.controller.ts          # POST /api/upload
│   ├── upload.service.ts             # Orchestrates IPA parse + QR gen + metadata save
│   └── multer-config.service.ts      # MulterOptionsFactory (disk storage, uuid dirs)
├── app-info/
│   ├── app-info.module.ts
│   └── app-info.controller.ts        # GET /app/:id, /api/app/:id, /api/icon/:id, /api/download/:id
├── manifest/
│   ├── manifest.module.ts
│   └── manifest.controller.ts        # GET /api/manifest/:id — serves OTA plist
├── cleanup/
│   ├── cleanup.module.ts
│   └── cleanup.service.ts            # @Cron(EVERY_HOUR) — removes expired uploads
├── services/
│   ├── ipa-parser.service.ts         # Extracts Info.plist + icon from IPA zip
│   ├── manifest-generator.service.ts # Builds OTA install plist XML
│   └── qr-generator.service.ts      # Generates QR code data URL
├── common/
│   ├── filters/multer-exception.filter.ts
│   └── interfaces/                   # IAppMetadata, IManifestOptions
└── types/bplist-parser.d.ts          # Ambient module declaration
public/                               # Static frontend (HTML/CSS/JS)
```

## Build & Run Commands

```bash
npm install              # Install dependencies
npm run build            # Build (nest build → dist/)
npm run start:dev        # Dev with watch (nest start --watch)
npm run start:debug      # Debug with watch (nest start --debug --watch)
npm start                # Production (node dist/main.js)
npx tsc --noEmit         # Type-check only (no emit)
docker compose up --build  # Docker
```

### Testing

**No test framework configured.** No Jest, Vitest, or test runner. No `*.spec.ts` files.

If adding tests:
- NestJS convention is Jest. Add `@nestjs/testing`, `jest`, `ts-jest` to devDependencies.
- Test files go next to source: `upload.service.spec.ts` beside `upload.service.ts`.
- `tsconfig.build.json` already excludes `**/*spec.ts` from production builds.
- Run a single test: `npx jest path/to/file.spec.ts` (once Jest is configured).

### Linting & Formatting

**No ESLint or Prettier configured.** If adding, follow NestJS defaults.

## Environment Variables

Configured via `.env` (loaded by `@nestjs/config`). See `.env.example`:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `BASE_URL` | `https://localhost:3000` | Public-facing URL (manifests, QR codes) |
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded IPA files |
| `MAX_FILE_SIZE` | `524288000` (500MB) | Max upload size in bytes |
| `RETENTION_HOURS` | `48` | Hours before uploads are auto-deleted |

## Code Style Guidelines

### Imports

- **NestJS:** Import from `@nestjs/*` packages
- **Node built-ins:** Namespace imports: `import * as fs from 'fs'`, `import * as path from 'path'`
- **Third-party:** Namespace imports: `import * as plist from 'plist'`, `import * as QRCode from 'qrcode'`
  - Exception: `sharp` uses default import (`import sharp from 'sharp'`)
- **Internal:** Relative paths only (`'../services/ipa-parser.service'`), no `@/` aliases
- **Order:** NestJS packages → Node built-ins → third-party → internal modules

### Naming Conventions

- **Files:** `kebab-case` with suffix: `upload.controller.ts`, `ipa-parser.service.ts`
- **Classes:** `PascalCase` with suffix: `UploadController`, `IpaParserService`
- **Interfaces:** Prefix with `I`: `IAppMetadata`, `IManifestOptions`
- **Methods/variables:** `camelCase`
- **Config keys:** Dot-notation: `'app.port'`, `'app.baseUrl'`, `'app.uploadDir'`
- **Unused params:** Prefix with underscore: `_file`, `_req`

### NestJS Patterns

- **Module per feature:** Own directory with `*.module.ts`, `*.controller.ts`, `*.service.ts`
- **DI:** Services injected via constructor with `private readonly`
- **Logger:** `private readonly logger = new Logger(ClassName.name)` per service
- **Config:** Inject `ConfigService`, read with `configService.get<T>('app.key', default)`

### Error Handling

- Throw `HttpException` with `{ success: false, error: string }` body + `HttpStatus` code
- Use `@UseFilters()` + `@Catch()` for domain-specific errors (e.g., `MulterExceptionFilter`)
- JSON error responses: `{ success: false, error: "message" }`
- Clean up filesystem artifacts in `catch` blocks (`fs.rmSync` on failed uploads)
- Use `this.logger.error()` for errors, `this.logger.warn()` for non-fatal issues
- Silent `catch` only for truly ignorable errors (race conditions in cleanup)

### Formatting

- **Indentation:** 2 spaces
- **Quotes:** Single quotes
- **Semicolons:** Always
- **Trailing commas:** Yes (multi-line arrays, objects, parameters)
- **Line length:** ~80 characters (soft limit)
- **Braces:** K&R style (opening brace on same line)

### Type Declarations

- Interfaces in `src/common/interfaces/` with `.interface.ts` suffix
- Ambient declarations in `src/types/` with `.d.ts` suffix
- Use generics with `ConfigService.get<T>()` for typed config access
- Extend Express types inline: `Request & { uploadId?: string }`

### TypeScript Compiler Settings

- `strictNullChecks: true` — handle `null`/`undefined` explicitly
- `noImplicitAny: false` — allowed but avoid in new code
- Decorators enabled (`experimentalDecorators`, `emitDecoratorMetadata`)

## CI/CD

GitHub Actions (`.github/workflows/ghcr.yml`): pushes to `main` build multi-arch
Docker images (amd64 + arm64) and push to GHCR.

## Key Dependencies

| Package | Purpose |
|---|---|
| `@nestjs/*` | Web framework, config, scheduling, static serving |
| `yauzl` | ZIP extraction (reads IPA files) |
| `plist` / `bplist-parser` | Parse iOS Info.plist (XML and binary) |
| `sharp` | Image processing (resize app icons) |
| `qrcode` | QR code data URL generation |
| `multer` | Multipart file upload handling |
| `uuid` | Generate unique upload IDs |
