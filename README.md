# EdgeStack

Your private local-first AI agent business automation hub.

EdgeStack lets non-technical founders and solopreneurs build, run, and monitor AI-powered business workflows completely locally. No cloud accounts, no API subscriptions, no Docker, and no technical knowledge required.

## Key Features

1. **Local-First Design**: Powered by native Ollama and llama.cpp. Zero cloud dependency.
2. **Embedded Cloud Emulator (Floci)**: Emulates cloud APIs (S3, SQS, SES, DynamoDB, etc.) inside a lightweight local JVM subprocess.
3. **Bedrock AI Bridge**: Intercepts cloud SDK Bedrock Runtime requests and routes them to your local Ollama instance on port 11434.
4. **Human-in-the-Loop (HITL) Gateways**: Failsafe workflows that pause on error, analyze failures using local AI, notify you, and await explicit retry approval.
5. **Vibrant Telemetry & Cost Analytics**: Real-time dashboard showing CPU/Memory/GPU usage alongside dynamic cost saving charts calculated using the local LLM.

## Prerequisites

- **macOS** 13.0 or higher
- **Java** 21+ (For running the local cloud services emulator)
- **Ollama** installed locally (Optional, EdgeStack can download models automatically)

## Running Locally

To build and run the development version of the application:

```bash
# Install NPM dependencies
npm install

# Start Tauri development environment
export PATH=$PATH:/Users/sarang/.local/node/bin
npm run tauri dev
```

## Production Build

To compile a distributable macOS Universal DMG package:

```bash
npm run tauri build -- --target universal-apple-darwin
```

## Directory Structure

All application state, local databases, and assets are stored in the user's home directory:
- SQLite database: `~/.edgestack/edgestack.db`
- Configuration: `~/.edgestack/config.toml`
- Telemetry & pricing records: `~/.edgestack/bedrock_pricing.json`
