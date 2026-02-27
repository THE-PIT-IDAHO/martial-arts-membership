"use client";

import { useEffect, useState, useRef } from "react";
import { jsPDF } from "jspdf";
import { getTodayString } from "@/lib/dates";
import { DateOfBirthPicker } from "@/components/date-of-birth-picker";

type WaiverSection = {
  id: string;
  title: string;
  content: string;
};

type GymSettings = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

const DEFAULT_GYM_SETTINGS: GymSettings = {
  name: "Our Martial Arts School",
  address: "",
  phone: "",
  email: "",
};

// Function to replace placeholders with actual values
function replacePlaceholders(
  text: string,
  gym: GymSettings,
  participantName?: string
): string {
  if (!text) return text;

  let result = text;

  // Member placeholders
  result = result.replace(/\{\{MEMBER_NAME\}\}/g, participantName || "");
  result = result.replace(/\{\{MEMBER_FIRST_NAME\}\}/g, "");
  result = result.replace(/\{\{MEMBER_LAST_NAME\}\}/g, "");
  result = result.replace(/\{\{PARENT_GUARDIAN\}\}/g, "");

  // Gym placeholders
  result = result.replace(/\{\{GYM_NAME\}\}/g, gym.name || "[Gym Name]");
  result = result.replace(/\{\{GYM_ADDRESS\}\}/g, gym.address || "[Gym Address]");
  result = result.replace(/\{\{GYM_PHONE\}\}/g, gym.phone || "[Gym Phone]");
  result = result.replace(/\{\{GYM_EMAIL\}\}/g, gym.email || "[Gym Email]");

  // Date placeholder
  result = result.replace(/\{\{DATE\}\}/g, new Date().toLocaleDateString());

  return result;
}

const DEFAULT_WAIVER_SECTIONS: WaiverSection[] = [
  {
    id: "assumption_of_risk",
    title: "ASSUMPTION OF RISK",
    content: "I understand that martial arts training involves physical contact and strenuous physical activity. I acknowledge that there are inherent risks associated with martial arts training including, but not limited to, bruises, sprains, strains, fractures, and other injuries that may occur during training, sparring, or practice."
  },
  {
    id: "waiver_release",
    title: "WAIVER AND RELEASE",
    content: "In consideration of being permitted to participate in martial arts classes, training, and related activities, I hereby waive, release, and discharge the martial arts school, its owners, instructors, employees, and agents from any and all liability, claims, demands, and causes of action arising out of or related to any loss, damage, or injury that may be sustained by me while participating in such activities."
  },
  {
    id: "medical_authorization",
    title: "MEDICAL AUTHORIZATION",
    content: "I authorize the staff to obtain emergency medical treatment for myself if necessary. I understand that I am responsible for any medical expenses incurred."
  },
  {
    id: "photo_video_release",
    title: "PHOTO/VIDEO RELEASE",
    content: "I grant permission for photographs and/or videos taken during classes or events to be used for promotional purposes, including but not limited to websites, social media, and marketing materials."
  },
  {
    id: "rules_regulations",
    title: "RULES AND REGULATIONS",
    content: "I agree to abide by all rules and regulations of the martial arts school. I understand that failure to follow instructions or rules may result in dismissal from the program without refund."
  },
  {
    id: "health_declaration",
    title: "HEALTH DECLARATION",
    content: "I certify that I am in good physical condition and have no medical conditions that would prevent safe participation in martial arts training. I agree to notify the instructors of any changes in health status."
  },
  {
    id: "closing_statement",
    title: "",
    content: "I HAVE READ THIS WAIVER AND RELEASE, FULLY UNDERSTAND ITS TERMS, AND SIGN IT FREELY AND VOLUNTARILY WITHOUT ANY INDUCEMENT."
  }
];

// Auto-capitalize first letter of each word
function autoCapitalize(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AdultWaiverPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signatureDate, setSignatureDate] = useState(getTodayString());
  const [waiverSections, setWaiverSections] = useState<WaiverSection[]>(DEFAULT_WAIVER_SECTIONS);
  const [gymSettings, setGymSettings] = useState<GymSettings>(DEFAULT_GYM_SETTINGS);
  const [gymLogoImg, setGymLogoImg] = useState<HTMLImageElement | null>(null);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Container ref for scrolling
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/public/waiver-data");
        if (res.ok) {
          const data = await res.json();
          if (data.waiverContent) {
            try {
              setWaiverSections(JSON.parse(data.waiverContent));
            } catch { /* Use defaults */ }
          }
          if (data.gymSettings) {
            try {
              setGymSettings(JSON.parse(data.gymSettings));
            } catch { /* Use defaults */ }
          }
          if (data.gymLogo) {
            const img = new Image();
            img.onload = () => setGymLogoImg(img);
            img.src = data.gymLogo;
          }
        }
      } catch (err) {
        console.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Canvas drawing functions
  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let x, y;

    if ("touches" in e) {
      x = (e.touches[0].clientX - rect.left) * scaleX;
      y = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      x = (e.clientX - rect.left) * scaleX;
      y = (e.clientY - rect.top) * scaleY;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let x, y;

    if ("touches" in e) {
      e.preventDefault();
      x = (e.touches[0].clientX - rect.left) * scaleX;
      y = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      x = (e.clientX - rect.left) * scaleX;
      y = (e.clientY - rect.top) * scaleY;
    }

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!agreedToTerms) {
      setError("You must agree to the terms and conditions");
      return;
    }

    if (!hasSignature) {
      setError("Please provide a signature");
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Generate PDF of the waiver
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      let yPos = 20;

      // Header - Logo + Gym Name
      if (gymLogoImg) {
        const logoH = 12;
        const aspect = gymLogoImg.naturalWidth / gymLogoImg.naturalHeight;
        const logoW = logoH * aspect;
        pdf.addImage(gymLogoImg, margin, yPos - 4, logoW, logoH);
      }
      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.text(gymSettings.name || "Martial Arts School", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;
      pdf.setFontSize(14);
      pdf.text("Adult Liability Waiver", pageWidth / 2, yPos, { align: "center" });
      yPos += 15;

      // Participant Info
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text("Participant Information", margin, yPos);
      yPos += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(`Name: ${firstName} ${lastName}`, margin, yPos);
      yPos += 5;
      if (dateOfBirth) pdf.text(`Date of Birth: ${new Date(dateOfBirth).toLocaleDateString()}`, margin, yPos);
      yPos += 5;
      if (email) pdf.text(`Email: ${email}`, margin, yPos);
      yPos += 5;
      if (phone) pdf.text(`Phone: ${phone}`, margin, yPos);
      yPos += 5;
      if (address) pdf.text(`Address: ${address}, ${city}, ${state} ${zipCode}`, margin, yPos);
      yPos += 10;

      // Waiver Sections
      for (const section of waiverSections) {
        if (yPos > 260) {
          pdf.addPage();
          yPos = 20;
        }
        if (section.title) {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          pdf.text(section.title, margin, yPos);
          yPos += 6;
        }
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        const lines = pdf.splitTextToSize(replacePlaceholders(section.content, gymSettings, `${firstName} ${lastName}`), maxWidth);
        for (const line of lines) {
          if (yPos > 270) {
            pdf.addPage();
            yPos = 20;
          }
          pdf.text(line, margin, yPos);
          yPos += 4;
        }
        yPos += 5;
      }

      // Signature section
      if (yPos > 230) {
        pdf.addPage();
        yPos = 20;
      }
      yPos += 10;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text("Signature", margin, yPos);
      yPos += 8;

      // Add signature image from canvas
      const canvas = canvasRef.current;
      if (canvas && hasSignature) {
        const signatureDataUrl = canvas.toDataURL("image/png");
        pdf.addImage(signatureDataUrl, "PNG", margin, yPos, 60, 20);
        yPos += 25;
      }

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(`Date: ${new Date(signatureDate).toLocaleDateString()}`, margin, yPos);
      yPos += 10;
      pdf.setFontSize(8);
      pdf.text(`Signed electronically on ${new Date().toLocaleString()}`, margin, yPos);

      // Convert PDF to base64
      const pdfBase64 = pdf.output("datauristring");

      // Submit waiver via public endpoint (creates member + saves PDF)
      const res = await fetch("/api/public/waiver-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email || undefined,
          phone: phone || undefined,
          dateOfBirth: dateOfBirth || undefined,
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          zipCode: zipCode || undefined,
          emergencyContactName: emergencyContactName || undefined,
          emergencyContactPhone: emergencyContactPhone || undefined,
          medicalNotes: medicalNotes || undefined,
          pdfBase64,
        }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        setError("Failed to submit waiver");
      }
    } catch (err) {
      setError("Failed to submit waiver");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setFirstName("");
    setLastName("");
    setDateOfBirth("");
    setEmail("");
    setPhone("");
    setAddress("");
    setCity("");
    setState("");
    setZipCode("");
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setMedicalNotes("");
    setAgreedToTerms(false);
    setSignatureDate(getTodayString());
    clearSignature();
    setSuccess(false);
    setError("");
    // Delay scroll to allow form to re-render first
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollTo({ top: 0, behavior: "instant" });
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    }, 50);
  }

  // Auto-reset after 3 seconds on success
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        resetForm();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
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
        <div className="h-full bg-gray-100 flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50">
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
        <div className="h-full bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-md p-8 text-center max-w-md">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Waiver Signed!</h2>
            <p className="text-gray-600 mb-4">
              Thank you for completing the liability waiver. You're all set to participate.
            </p>
            <p className="text-sm text-gray-500">
              Signed on {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
      <div ref={containerRef} className="bg-gray-100 py-4 sm:py-8 px-2 sm:px-4 overflow-y-auto">
        <div className="max-w-3xl mx-auto pb-8">
<div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-primary text-white p-4 sm:p-6 text-center">
            <h1 className="text-xl sm:text-2xl font-bold">Adult Waiver</h1>
            <p className="text-xs sm:text-sm opacity-90 mt-1">Liability Waiver & Release Form</p>
          </div>

          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 sm:space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Participant Information */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 border-b pb-2">
                Participant Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(autoCapitalize(e.target.value))}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(autoCapitalize(e.target.value))}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date of Birth *
                  </label>
                  <DateOfBirthPicker
                    value={dateOfBirth}
                    onChange={setDateOfBirth}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-3 sm:mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(autoCapitalize(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(autoCapitalize(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(autoCapitalize(e.target.value))}
                      className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP Code
                    </label>
                    <input
                      type="text"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Emergency Contact */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 border-b pb-2">
                Emergency Contact
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Name *
                  </label>
                  <input
                    type="text"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(autoCapitalize(e.target.value))}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Phone *
                  </label>
                  <input
                    type="tel"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </section>

            {/* Medical Information */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 border-b pb-2">
                Medical Information
              </h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Medical Notes / Health Conditions
                </label>
                <textarea
                  value={medicalNotes}
                  onChange={(e) => setMedicalNotes(e.target.value)}
                  rows={3}
                  placeholder="Please list any medical conditions, allergies, injuries, or other health information the instructors should be aware of..."
                  className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </section>

            {/* Waiver Terms */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 border-b pb-2">
                Waiver & Release of Liability
              </h2>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 max-h-48 sm:max-h-64 overflow-y-auto text-xs sm:text-sm text-gray-700 space-y-2 sm:space-y-3">
                {waiverSections.map((section) => (
                  <p key={section.id}>
                    {section.title && <strong>{section.title}:</strong>} {replacePlaceholders(section.content, gymSettings, firstName && lastName ? `${firstName} ${lastName}` : "")}
                  </p>
                ))}
              </div>
            </section>

            {/* Agreement Checkbox */}
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
              <input
                type="checkbox"
                id="agree"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-5 w-5 sm:h-4 sm:w-4 rounded border-gray-300 text-primary focus:ring-primary flex-shrink-0"
              />
              <label htmlFor="agree" className="text-xs sm:text-sm text-gray-700">
                I have read and agree to the terms and conditions stated above. I understand that this is a legally binding agreement and that I am giving up certain legal rights by signing this waiver.
              </label>
            </div>

            {/* Signature Section */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 border-b pb-2">
                Signature
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sign in the box below using your finger or stylus:
                  </label>
                  <div className="border-2 border-primary rounded-xl overflow-hidden bg-white shadow-inner relative">
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={200}
                      className="w-full cursor-crosshair touch-none"
                      style={{ height: "150px", minHeight: "150px" }}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                    {!hasSignature && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-gray-300 text-lg sm:text-xl font-handwriting select-none">Sign Here</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500">Use your finger or stylus to sign</span>
                    <button
                      type="button"
                      onClick={clearSignature}
                      className="text-sm text-primary hover:text-primaryDark font-medium flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Clear
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={signatureDate}
                    onChange={(e) => setSignatureDate(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </section>

            {/* Submit Button */}
            <div className="pt-4 sm:pt-6 border-t">
              <button
                type="submit"
                disabled={submitting || !agreedToTerms}
                className="w-full rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? "Submitting..." : "Sign Waiver"}
              </button>
              <p className="text-center text-xs text-gray-500 mt-3 sm:hidden">
                Tap the button above to submit your waiver
              </p>
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          This form is securely processed. Your information is kept confidential.
        </p>
      </div>
    </div>
    </div>
  );
}
