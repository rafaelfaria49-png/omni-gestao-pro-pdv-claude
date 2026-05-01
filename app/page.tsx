"use client"

import { useCallback, useState } from "react"
import "@/components/landing/lovable/landing.css"
import { Navbar } from "@/components/landing/lovable/Navbar"
import { Hero } from "@/components/landing/lovable/Hero"
import { AIMarquee } from "@/components/landing/lovable/AIMarquee"
import { ValueStack } from "@/components/landing/lovable/ValueStack"
import { BeforeAfter } from "@/components/landing/lovable/BeforeAfter"
import { Arsenal } from "@/components/landing/lovable/Arsenal"
import { Testimonials } from "@/components/landing/lovable/Testimonials"
import { Academy } from "@/components/landing/lovable/Academy"
import { Pricing } from "@/components/landing/lovable/Pricing"
import { CreditsExplainer } from "@/components/landing/lovable/CreditsExplainer"
import { FAQ } from "@/components/landing/lovable/FAQ"
import { FinalCTA } from "@/components/landing/lovable/FinalCTA"
import { Footer } from "@/components/landing/lovable/Footer"
import { SignupModal } from "@/components/landing/lovable/SignupModal"
import { ComparisonModal } from "@/components/landing/lovable/ComparisonModal"

export default function Page() {
  const [signupOpen, setSignupOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [planName, setPlanName] = useState<string | undefined>(undefined)

  const openSignup = useCallback((plan?: string) => {
    setPlanName(plan)
    setSignupOpen(true)
  }, [])

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-background text-foreground">
      <Navbar onCta={() => openSignup()} />
      <Hero onCta={() => openSignup()} />
      <AIMarquee />
      <ValueStack onCta={() => openSignup()} />
      <BeforeAfter />
      <Arsenal />
      <Testimonials />
      <Academy />
      <Pricing
        onSelect={(plan) => openSignup(plan)}
        onCompare={() => setCompareOpen(true)}
      />
      <CreditsExplainer />
      <FAQ />
      <FinalCTA onCta={() => openSignup()} />
      <Footer />

      <SignupModal open={signupOpen} onOpenChange={setSignupOpen} planName={planName} />
      <ComparisonModal open={compareOpen} onOpenChange={setCompareOpen} />
    </div>
  )
}

