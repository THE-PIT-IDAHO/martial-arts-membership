"use client";

import Link from "next/link";

export default function BlankWaiversPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - matches portal */}
      <header className="sticky top-0 z-40 bg-primary shadow-sm">
        <div className="flex items-center justify-center gap-2.5 px-4 py-2.5">
          <img src="/logo.png" alt="Dojo Storm" className="h-7 w-7 object-contain drop-shadow-md" />
          <div className="flex flex-col leading-none brand-dynamic">
            <span className="text-sm font-black tracking-wider uppercase text-white">
              Dojo <span className="italic">Storm</span>
            </span>
            <span className="text-[8px] uppercase tracking-[0.25em] font-semibold text-white/80">
              Software
            </span>
          </div>
        </div>
      </header>

      <div className="py-4 sm:py-8 px-2 sm:px-4">
        <div className="max-w-3xl mx-auto pb-8">
          <div className="text-center mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Liability Waiver</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Please select the appropriate waiver to sign
            </p>
          </div>

          {/* Waiver Cards */}
          <div className="space-y-4">
            {/* Adult Waiver Card */}
            <div className="bg-white border border-gray-200 rounded-xl sm:rounded-lg overflow-hidden shadow-sm">
              <div className="bg-primary text-white p-3 sm:p-4">
                <h2 className="text-base sm:text-lg font-semibold">Adult Waiver</h2>
                <p className="text-xs sm:text-sm opacity-90">For adult participants (18+)</p>
              </div>
              <div className="p-3 sm:p-4 text-center">
                <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                  Standard liability waiver for adult members. Includes all standard sections:
                  assumption of risk, waiver and release, medical authorization, photo/video release,
                  rules and regulations, and health declaration.
                </p>
                <Link
                  href="/waivers/blank/adult"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark active:scale-[0.98] transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Adult Waiver
                </Link>
              </div>
            </div>

            {/* Guardian and Dependent Waiver Card */}
            <div className="bg-white border border-gray-200 rounded-xl sm:rounded-lg overflow-hidden shadow-sm">
              <div className="bg-primary text-white p-3 sm:p-4">
                <h2 className="text-base sm:text-lg font-semibold">Guardian and Dependent Waiver</h2>
                <p className="text-xs sm:text-sm opacity-90">For minors with parent/guardian signature</p>
              </div>
              <div className="p-3 sm:p-4 text-center">
                <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                  Liability waiver for minor participants requiring a parent or legal guardian signature.
                  Includes dependent information section and guardian authorization.
                </p>
                <Link
                  href="/waivers/blank/guardian"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark active:scale-[0.98] transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Guardian and Dependent Waiver
                </Link>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-gray-500 mt-6">
            This form is securely processed. Your information is kept confidential.
          </p>
        </div>
      </div>
    </div>
  );
}
