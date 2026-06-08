// Notification polling removed.
// The API server now sends Discord notifications directly on approve/reject/announce
// via artifacts/api-server/src/lib/discordNotifier.ts (Discord REST API, no discord.js).
// The bot only handles user interactions (slash commands, modals, registrations).
