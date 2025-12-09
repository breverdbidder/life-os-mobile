# Life OS Mobile

**Your private AI interface with zero third-party exposure.**

Direct Claude API integration with automatic token monitoring, checkpoint system, and session resume - all hosted on your own infrastructure.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    YOUR PHONE                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Life OS Mobile (PWA)                    │  │
│  │  • Token monitoring UI                           │  │
│  │  • Auto-checkpoint prompts                       │  │
│  │  • Session resume capability                     │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│              YOUR VERCEL (life-os-mobile)              │
│  • Next.js API routes                                  │
│  • Streaming response handler                          │
│  • Checkpoint management                               │
└────────────────────────────────────────────────────────┘
                    │             │
                    ▼             ▼
┌──────────────────────┐  ┌──────────────────────┐
│   ANTHROPIC API      │  │   YOUR SUPABASE      │
│   (Claude Direct)    │  │   • Checkpoints      │
│   • No middleman     │  │   • Activities       │
│   • Full context     │  │   • Session state    │
└──────────────────────┘  └──────────────────────┘
```

**IP Protection:** Slack never sees your prompts, code, or methodology.

## Features

- **Real-time Token Monitor** - Visual progress bar with percentage
- **Auto-Checkpoint** - Prompts at 70% context, warns at 85%
- **Session Resume** - Continue interrupted conversations seamlessly
- **Mobile-First PWA** - Install on home screen, works offline-first
- **Zero Third-Party** - Only Anthropic (required) + your Supabase

## Deployment

### 1. Create GitHub Repo

```bash
# In the life-os-mobile directory
git init
git add .
git commit -m "Initial: Life OS Mobile interface"
git remote add origin https://github.com/breverdbidder/life-os-mobile.git
git push -u origin main
```

### 2. Run Supabase Migration

Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/mocerqjnksmhcjzxrewo/sql) and run:

```sql
-- Copy contents of supabase/migrations/001_session_checkpoints.sql
```

### 3. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import `breverdbidder/life-os-mobile`
3. Add Environment Variables:

| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | Your Claude API key |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://mocerqjnksmhcjzxrewo.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |

4. Deploy

### 4. Install as Mobile App

**iPhone:**
1. Open deployed URL in Safari
2. Tap Share → "Add to Home Screen"
3. Name it "Life OS"

**Android:**
1. Open deployed URL in Chrome
2. Tap menu → "Add to Home screen"

## Usage

### Normal Flow
1. Open Life OS on phone
2. Chat naturally
3. Watch token meter in header
4. At 70%+ → checkpoint button appears
5. Save checkpoint → continue fresh
6. Next session → "Resume" prompt appears

### Session Recovery
- Internet drops mid-response → refresh → last state preserved
- Hit context limit → auto-checkpoint → new session continues
- Crash → reopen → resume from checkpoint

## Security

**What stays private:**
- Your prompts (only to Anthropic, required)
- Your code methodology
- Your business logic
- Checkpoint contents (in your Supabase only)

**What NO third party sees:**
- Slack ❌
- OpenAI ❌
- Any collaboration tool ❌

## File Structure

```
life-os-mobile/
├── app/
│   ├── api/
│   │   ├── chat/route.ts      # Claude streaming
│   │   └── checkpoint/route.ts # Save/load state
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               # Main chat UI
├── lib/
│   ├── supabase.ts
│   └── token-monitor.ts       # Token tracking logic
├── public/
│   └── manifest.json          # PWA config
├── supabase/
│   └── migrations/
│       └── 001_session_checkpoints.sql
├── .env.example
├── package.json
└── README.md
```

## Credits

IP Protected | Ariel Shapira, Solo Founder | Everest Capital USA
