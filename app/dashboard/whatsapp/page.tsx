export const dynamic = "force-dynamic"

import WhatsAppOperationalHub from "@/components/whatsapp/WhatsAppOperationalHub"

export default function WhatsAppPage() {
  return (
    <div className="w-full h-full min-w-0 flex flex-col overflow-hidden px-4 py-5 sm:px-6 lg:px-8 pb-6 bg-background">
      <WhatsAppOperationalHub />
    </div>
  )
}
