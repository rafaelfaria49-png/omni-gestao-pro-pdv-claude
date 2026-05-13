export const dynamic = "force-dynamic"

import WhatsAppInbox from "@/components/whatsapp/WhatsAppInbox"

export default function WhatsAppPage() {
  return (
    <div className="min-w-0 overflow-x-hidden px-4 pb-2 pt-4 -mx-4 sm:-mx-6">
      <WhatsAppInbox />
    </div>
  )
}
