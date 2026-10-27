import { createFileRoute } from '@tanstack/react-router'
import { handleWebhook } from '#/whatsapp/webhook'

export const Route = createFileRoute('/api/whatsapp/webhook')({
  server: {
    handlers: {
      GET: ({ request }) => handleWebhook(request),
      POST: ({ request }) => handleWebhook(request),
    },
  },
})
