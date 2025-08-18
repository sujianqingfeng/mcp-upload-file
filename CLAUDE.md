# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run build` - Build the project using tsup
- `npm run dev` - Build in watch mode for development
- `npm test` - Run tests using Vitest
- `npm run preview` - Run the built MCP server locally
- `npm run build:tsc` - Build with TypeScript compiler directly

## Project Architecture

This is an MCP (Model Context Protocol) server that provides file upload functionality. The architecture is straightforward:

### Core Components

- **Main Server** (`src/index.ts`): Single-file MCP server using `@modelcontextprotocol/sdk`
- **Upload Handler** (`uploadFileHandler`): Handles both local file paths and URLs, converts files to FormData for upload
- **Environment Configuration**: Uses env vars for upload endpoint configuration

### Key Implementation Details

- Uses `undici` for HTTP requests and FormData handling
- Supports both local file paths (including `file://` URIs) and HTTP(S) URLs as input
- Converts Buffer to Blob via `new Blob([new Uint8Array(buffer)])` for FormData compatibility
- Environment variables control upload behavior:
  - `UPLOAD_URL`: Target upload endpoint (required)
  - `FILE_KEY`: Form field name for the file (required) 
  - `FILE_NAME`: Form field name for filename (required)
  - `EXTRA_FORM`: Additional form fields as JSON string (optional)

### Testing Strategy

- Uses Vitest for testing
- Mocks `undici` and `FormData` for upload testing
- Tests file URI handling, Buffer-to-Blob conversion, and error cases
- Sets `SKIP_MCP_MAIN=1` to prevent CLI execution during tests

### Code Quality

- Uses Biome for linting and formatting with tabs, 80-char line width
- TypeScript with Node16 module resolution and strict mode
- ESM modules throughout