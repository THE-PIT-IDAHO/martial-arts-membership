"use client";

import { useEffect, useState } from "react";

type MemberInfo = {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
};

export default function PortalCheckinPage() {
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setMember({
            id: data.memberId,
            firstName: data.firstName,
            lastName: data.lastName,
            photoUrl: data.photoUrl,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-gray-500">Unable to load your profile.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-md mx-auto">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-6 py-5 text-center">
          <h1 className="text-xl font-bold text-white">Check In</h1>
          <p className="text-sm text-white/80 mt-1">Scan this QR code at the gym location</p>
        </div>

        {/* QR Code */}
        <div className="px-6 py-8 flex flex-col items-center">
          <div className="bg-white p-3 rounded-xl border-2 border-gray-100 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/api/portal/qrcode"
              alt="Your Check-In QR Code"
              className="w-40 h-40"
            />
          </div>

          {/* Member Info */}
          <div className="mt-6 flex flex-col items-center">
            {member.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.photoUrl}
                alt={`${member.firstName} ${member.lastName}`}
                className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 mb-3"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-xl font-bold text-gray-500 mb-3">
                {member.firstName[0]}{member.lastName[0]}
              </div>
            )}
            <p className="text-lg font-bold text-gray-900">
              {member.firstName} {member.lastName}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
