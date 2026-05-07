# MSH WhatsApp Agent

Handles booking requests from pet owners on WhatsApp.

## Setup

cd whatsapp-agent
npm install
cp .env.example .env
# Fill in .env values

## Required environment variables

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)

## Optional environment variables

- `STAFF_GROUP_ID` (required for staff command notifications)
- `CHROME_EXECUTABLE_PATH` (only if you need a custom browser binary path)

## First run (get QR code + group IDs)

npm start
# Scan the QR code with your WhatsApp Business phone
# Terminal prints all group IDs -- copy your staff group ID to .env
# Restart: npm start

## Commands (send in staff WhatsApp group)

!bot +971XXXXXXXXX       activate agent for this owner
!human +971XXXXXXXXX     return conversation to receptionist
!confirm MSH-2026-XXXXX  confirm a draft booking (owner notified)
!reject MSH-2026-XXXXX [reason]  cancel a draft (owner notified)

## Deploy to Railway

1. Push this repo to GitHub
2. New project in Railway -> Deploy from GitHub repo
3. Set root directory to /whatsapp-agent
4. Ensure a private Supabase storage bucket named `whatsapp-sessions` exists
5. Add environment variables from .env
6. Deploy

Notes:
- This service is a worker process and does not expose an HTTP port.
- If `STAFF_GROUP_ID` is missing, startup prints available WhatsApp group IDs.

## How it works

Owners WhatsApp the MSH number.
By default all conversations are in human mode (receptionist handles).
Receptionist types !bot +971XXXXXXXXX in the staff group to activate the agent.
Agent handles the conversation, creates draft bookings if needed.
Receptionist confirms drafts with !confirm in the staff group.
Receptionist can reclaim any conversation with !human at any time.
