"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TestingCurriculumRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/curriculum");
  }, [router]);
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm text-gray-500">Redirecting to Curriculum Builder...</p>
    </div>
  );
}
