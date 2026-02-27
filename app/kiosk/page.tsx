"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type GymSettings = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

type Membership = {
  id: string;
  status: string;
  membershipPlan: {
    id: string;
    name: string;
    allowedStyles: string | null; // JSON array of style IDs or null for all styles
  };
};

type StyleEntry = {
  name: string;
  rank?: string;
  rankId?: string;
  rankOrder?: number;
  status?: string;
};

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  memberNumber: number | null;
  primaryStyle: string | null;
  stylesNotes: string | null; // JSON array of style entries
  rank: string | null;
  status: string;
  dateOfBirth: string | null;
  memberships: Membership[];
  trialPasses?: { id: string; status: string; classesUsed: number; maxClasses: number; expiresAt: string }[];
};

type Rank = {
  id: string;
  name: string;
  order: number;
  styleId: string;
};

type Style = {
  id: string;
  name: string;
  ranks: Rank[];
};

type ClassSession = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  classType: string | null;
  styleId: string | null;
  styleName: string | null;
  styleIds: string | null; // JSON array of style IDs
  styleNames: string | null; // JSON array of style names
  minRankId: string | null;
  minRankName: string | null;
  color: string | null;
  kioskEnabled: boolean;
};

type CheckInState = "idle" | "search" | "confirm" | "success" | "error";

type KioskSettings = {
  exitPin: string;
  welcomeMessage: string;
  logoUrl: string;
  autoConfirm: boolean;
  allowedStyleIds: string[];
  autoChangeMinutes: number;
};

const DEFAULT_KIOSK_SETTINGS: KioskSettings = {
  exitPin: "",
  welcomeMessage: "",
  logoUrl: "",
  autoConfirm: true,
  allowedStyleIds: [],
  autoChangeMinutes: 10,
};

export default function KioskPage() {
  const [gymSettings, setGymSettings] = useState<GymSettings>({ name: "Martial Arts Academy", address: "", phone: "", email: "" });
  const [gymLogo, setGymLogo] = useState("");
  const [kioskSettings, setKioskSettings] = useState<KioskSettings>(DEFAULT_KIOSK_SETTINGS);
  const [members, setMembers] = useState<Member[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [todaysClasses, setTodaysClasses] = useState<ClassSession[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassSession | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [checkInState, setCheckInState] = useState<CheckInState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [recentCheckIns, setRecentCheckIns] = useState<{ member: Member; time: Date }[]>([]);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [scanMode, setScanMode] = useState(false);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-change class based on timing settings (check every 30 seconds)
  useEffect(() => {
    if (todaysClasses.length === 0) return;

    const timer = setInterval(() => {
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const autoChangeMins = kioskSettings.autoChangeMinutes || 10;

      const currentClass = todaysClasses.find((c) => {
        const start = new Date(c.startsAt);
        const end = new Date(c.endsAt);
        const startMins = start.getHours() * 60 + start.getMinutes();
        const endMins = end.getHours() * 60 + end.getMinutes();
        return nowMins >= startMins - autoChangeMins && nowMins <= endMins;
      });

      if (currentClass && currentClass.id !== selectedClass?.id) {
        setSelectedClass(currentClass);
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [todaysClasses, kioskSettings.autoChangeMinutes, selectedClass]);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        // Load gym settings, kiosk settings, and gym logo
        const [gymRes, kioskRes, allSettingsRes] = await Promise.all([
          fetch("/api/settings?key=gym_settings"),
          fetch("/api/settings?key=kiosk_settings"),
          fetch("/api/settings"),
        ]);
        if (gymRes.ok) {
          const gymData = await gymRes.json();
          if (gymData.setting?.value) {
            try {
              setGymSettings(JSON.parse(gymData.setting.value));
            } catch {
              // Use default
            }
          }
        }
        if (allSettingsRes.ok) {
          const allData = await allSettingsRes.json();
          if (allData.settings && Array.isArray(allData.settings)) {
            const logoSetting = allData.settings.find((s: { key: string; value: string }) => s.key === "gymLogo");
            if (logoSetting?.value) setGymLogo(logoSetting.value);
          }
        }
        let loadedKioskSettings = DEFAULT_KIOSK_SETTINGS;
        if (kioskRes.ok) {
          const kioskData = await kioskRes.json();
          if (kioskData.setting?.value) {
            try {
              loadedKioskSettings = { ...DEFAULT_KIOSK_SETTINGS, ...JSON.parse(kioskData.setting.value) };
              setKioskSettings(loadedKioskSettings);
            } catch {
              // Use default
            }
          }
        }

        // Load members
        const membersRes = await fetch("/api/members");
        if (membersRes.ok) {
          const membersData = await membersRes.json();
          setMembers(membersData.members || []);
        }

        // Load styles (for rank validation)
        const stylesRes = await fetch("/api/styles");
        if (stylesRes.ok) {
          const stylesData = await stylesRes.json();
          setStyles(stylesData.styles || []);
        }

        // Load classes
        const classesRes = await fetch("/api/classes");
        if (classesRes.ok) {
          const classesData = await classesRes.json();
          const allClasses = classesData.classes || [];
          // Filter out imported classes and classes not enabled for kiosk
          const nonImportedClasses = allClasses.filter((c: ClassSession) => {
            const nameHasImported = c.name.toLowerCase().includes("imported");
            const classTypeIsImported = c.classType?.toLowerCase() === "imported";
            if (nameHasImported || classTypeIsImported) return false;
            if (!c.kioskEnabled) return false;
            return true;
          });
          setClasses(nonImportedClasses);

          // Filter to today's classes (based on day of week matching)
          const today = new Date();
          const dayOfWeek = today.getDay();

          let todayClasses = nonImportedClasses.filter((c: ClassSession) => {
            const classDate = new Date(c.startsAt);
            return classDate.getDay() === dayOfWeek;
          }).sort((a: ClassSession, b: ClassSession) => {
            const aTime = new Date(a.startsAt);
            const bTime = new Date(b.startsAt);
            return aTime.getHours() * 60 + aTime.getMinutes() - (bTime.getHours() * 60 + bTime.getMinutes());
          });

          // Apply style filter from kiosk settings
          if (loadedKioskSettings.allowedStyleIds.length > 0) {
            todayClasses = todayClasses.filter((c: ClassSession) => {
              // Check styleIds JSON array
              if (c.styleIds) {
                try {
                  const ids: string[] = JSON.parse(c.styleIds);
                  if (ids.some((id: string) => loadedKioskSettings.allowedStyleIds.includes(id))) return true;
                } catch { /* ignore */ }
              }
              // Check legacy styleId
              if (c.styleId && loadedKioskSettings.allowedStyleIds.includes(c.styleId)) return true;
              // Classes with no style pass through
              if (!c.styleIds && !c.styleId) return true;
              return false;
            });
          }

          setTodaysClasses(todayClasses);

          // Auto-select the current or next upcoming class
          const autoChangeMins = loadedKioskSettings.autoChangeMinutes || 10;
          const now = today.getHours() * 60 + today.getMinutes();
          const currentClass = todayClasses.find((c: ClassSession) => {
            const start = new Date(c.startsAt);
            const end = new Date(c.endsAt);
            const startMins = start.getHours() * 60 + start.getMinutes();
            const endMins = end.getHours() * 60 + end.getMinutes();
            return now >= startMins - autoChangeMins && now <= endMins;
          });

          if (currentClass) {
            setSelectedClass(currentClass);
          } else if (todayClasses.length > 0) {
            // Select the next upcoming class
            const nextClass = todayClasses.find((c: ClassSession) => {
              const start = new Date(c.startsAt);
              const startMins = start.getHours() * 60 + start.getMinutes();
              return startMins > now;
            });
            setSelectedClass(nextClass || todayClasses[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load kiosk data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Parse member's styles from stylesNotes JSON
  const getMemberStyles = (member: Member): StyleEntry[] => {
    if (!member.stylesNotes) return [];
    try {
      const parsed = JSON.parse(member.stylesNotes);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  // Check if member has active membership or trial pass that covers the class style
  const hasValidMembershipForClass = (member: Member, classSession: ClassSession | null): boolean => {
    // Check for active trial pass
    const activeTrial = member.trialPasses?.find(
      (t) => t.status === "ACTIVE" && t.classesUsed < t.maxClasses && new Date(t.expiresAt) > new Date()
    );
    if (activeTrial) return true;

    if (!member.memberships || member.memberships.length === 0) return false;

    // Must have at least one active membership
    const activeMemberships = member.memberships.filter(m => m.status === "ACTIVE");
    if (activeMemberships.length === 0) return false;

    // If no class selected or class has no style requirement, any active membership works
    if (!classSession) return true;

    // Get the class's required style IDs
    let classStyleIds: string[] = [];
    if (classSession.styleIds) {
      try {
        classStyleIds = JSON.parse(classSession.styleIds);
      } catch {
        // Ignore parse errors
      }
    } else if (classSession.styleId) {
      classStyleIds = [classSession.styleId];
    }

    // If class has no style requirement, any active membership works
    if (classStyleIds.length === 0) return true;

    // Check if any active membership covers at least one of the class styles
    for (const membership of activeMemberships) {
      const plan = membership.membershipPlan;

      // null allowedStyles means plan covers ALL styles
      if (plan.allowedStyles === null) return true;

      try {
        const planStyleIds: string[] = JSON.parse(plan.allowedStyles);
        // Check if plan covers any of the class's required styles
        if (classStyleIds.some(classStyleId => planStyleIds.includes(classStyleId))) {
          return true;
        }
      } catch {
        // If parse fails, skip this membership
      }
    }

    return false;
  };

  // Check if member meets the style requirement for the class
  const meetsStyleRequirement = (member: Member, classSession: ClassSession | null): boolean => {
    if (!classSession) return true;

    // Get class required styles
    let classStyleNames: string[] = [];
    if (classSession.styleNames) {
      try {
        classStyleNames = JSON.parse(classSession.styleNames);
      } catch {
        // Ignore parse errors
      }
    } else if (classSession.styleName) {
      classStyleNames = [classSession.styleName];
    }

    // If no style requirement, any member can attend
    if (classStyleNames.length === 0) return true;

    // Get member's styles
    const memberStyles = getMemberStyles(member);

    // Also check primaryStyle as fallback
    const memberStyleNames = memberStyles
      .filter(s => s.status !== "INACTIVE")
      .map(s => s.name.toLowerCase());
    if (member.primaryStyle) {
      memberStyleNames.push(member.primaryStyle.toLowerCase());
    }

    // Member must have at least one of the required styles
    return classStyleNames.some(cs =>
      memberStyleNames.includes(cs.toLowerCase())
    );
  };

  // Check if member meets the rank requirement for the class
  const meetsRankRequirement = (member: Member, classSession: ClassSession | null): boolean => {
    if (!classSession) return true;

    // If no rank requirement, any member can attend
    if (!classSession.minRankId && !classSession.minRankName) return true;

    // Find the minimum rank requirement details
    let minRankOrder: number | null = null;
    let requiredStyleId: string | null = null;

    // Find the rank in our styles data
    for (const style of styles) {
      const rank = style.ranks.find(r =>
        r.id === classSession.minRankId || r.name === classSession.minRankName
      );
      if (rank) {
        minRankOrder = rank.order;
        requiredStyleId = style.id;
        break;
      }
    }

    // If we couldn't find the rank info, be permissive
    if (minRankOrder === null) return true;

    // Get member's styles and find their rank in the required style
    const memberStyles = getMemberStyles(member);

    // Find the style that matches our requirement
    const requiredStyle = styles.find(s => s.id === requiredStyleId);
    if (!requiredStyle) return true;

    // Check if member has this style and their rank meets the requirement
    const memberStyleEntry = memberStyles.find(ms =>
      ms.name.toLowerCase() === requiredStyle.name.toLowerCase() && ms.status !== "INACTIVE"
    );

    if (!memberStyleEntry || !memberStyleEntry.rank) return false;

    // Find member's rank order
    const memberRank = requiredStyle.ranks.find(r =>
      r.name === memberStyleEntry.rank || r.id === memberStyleEntry.rankId
    );

    if (!memberRank) return false;

    // Member's rank order must be >= min required order (higher order = more advanced)
    return memberRank.order >= minRankOrder;
  };

  // Check if member can check in to the specific class
  const canMemberCheckInToClass = useCallback((member: Member, classSession: ClassSession | null): boolean => {
    // Must have a valid (active) membership covering the class
    // Note: We don't check member.status here because cancelled members may still have
    // active memberships that haven't expired yet - they should be allowed to use those
    if (!hasValidMembershipForClass(member, classSession)) return false;

    // If no class is selected, allow check-in (general eligibility)
    if (!classSession) return true;

    // Check style requirement (if class has style restriction)
    if (!meetsStyleRequirement(member, classSession)) return false;

    // Check rank requirement (if class has rank restriction)
    if (!meetsRankRequirement(member, classSession)) return false;

    return true;
  }, [styles]);

  // Get member's rank and style for the selected class (returns matching style/rank or null)
  const getMemberRankForClass = (member: Member, classSession: ClassSession | null): { styleName: string; rank: string } | null => {
    if (!classSession) return null;

    // Get class required style names
    let classStyleNames: string[] = [];
    if (classSession.styleNames) {
      try {
        classStyleNames = JSON.parse(classSession.styleNames);
      } catch {
        // Ignore parse errors
      }
    } else if (classSession.styleName) {
      classStyleNames = [classSession.styleName];
    }

    // If no style requirement, don't show any rank
    if (classStyleNames.length === 0) return null;

    // Get member's styles
    const memberStyles = getMemberStyles(member);

    // Find matching style entry
    for (const styleEntry of memberStyles) {
      if (styleEntry.status === "INACTIVE") continue;
      if (classStyleNames.some(cs => cs.toLowerCase() === styleEntry.name.toLowerCase())) {
        if (styleEntry.rank) {
          return { styleName: styleEntry.name, rank: styleEntry.rank };
        }
      }
    }

    return null;
  };

  // Search members - only show those eligible for the selected class
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    const q = query.toLowerCase();
    const results = members
      .filter((m) => {
        // Check if member can check in to the selected class
        if (!canMemberCheckInToClass(m, selectedClass)) return false;

        const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
        const memberNum = m.memberNumber?.toString() || "";
        return fullName.includes(q) || memberNum.includes(q);
      })
      .slice(0, 8); // Limit to 8 results

    setSearchResults(results);
  }, [members, selectedClass, canMemberCheckInToClass]);

  // Handle class selection - clear any pending search/selection state
  const handleClassChange = (cls: ClassSession) => {
    if (cls.id !== selectedClass?.id) {
      // Reset search and selection when class changes
      setSearchQuery("");
      setSearchResults([]);
      setSelectedMember(null);
      setCheckInState("idle");
    }
    setSelectedClass(cls);
  };

  // Select member to check in
  const handleSelectMember = (member: Member) => {
    setSelectedMember(member);
    setCheckInState("confirm");
    setSearchQuery("");
    setSearchResults([]);
    setScanMode(false);
  };

  // Handle QR code scan result
  const handleQrScan = useCallback((decodedText: string) => {
    try {
      const data = JSON.parse(decodedText);
      const memberId = data.memberId;
      if (!memberId) return;
      const found = members.find((m) => m.id === memberId);
      if (found) {
        handleSelectMember(found);
      } else {
        setErrorMessage("Member not found");
        setCheckInState("error");
      }
    } catch {
      // Try matching by member number
      const found = members.find((m) => m.memberNumber?.toString() === decodedText);
      if (found) {
        handleSelectMember(found);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  // Confirm check-in
  const handleCheckIn = async () => {
    if (!selectedMember || !selectedClass) return;

    // Re-validate that member can still check in to this class
    // (in case the class was changed after member selection)
    if (!canMemberCheckInToClass(selectedMember, selectedClass)) {
      setErrorMessage("This member is not eligible for this class.");
      setCheckInState("error");
      setTimeout(() => {
        setCheckInState("idle");
        setSelectedMember(null);
        setErrorMessage("");
      }, 3000);
      return;
    }

    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: selectedMember.id,
          classSessionId: selectedClass.id,
          attendanceDate: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
          source: "KIOSK",
        }),
      });

      if (res.ok) {
        setCheckInState("success");
        setRecentCheckIns((prev) => [
          { member: selectedMember, time: new Date() },
          ...prev.slice(0, 4), // Keep last 5
        ]);

        // Auto-reset after 3 seconds
        setTimeout(() => {
          setCheckInState("idle");
          setSelectedMember(null);
        }, 3000);
      } else if (res.status === 409) {
        setErrorMessage("Already checked in to this class!");
        setCheckInState("error");
        setTimeout(() => {
          setCheckInState("idle");
          setSelectedMember(null);
          setErrorMessage("");
        }, 3000);
      } else {
        setErrorMessage("Check-in failed. Please try again.");
        setCheckInState("error");
        setTimeout(() => {
          setCheckInState("idle");
          setSelectedMember(null);
          setErrorMessage("");
        }, 3000);
      }
    } catch (err) {
      setErrorMessage("Network error. Please try again.");
      setCheckInState("error");
      setTimeout(() => {
        setCheckInState("idle");
        setSelectedMember(null);
        setErrorMessage("");
      }, 3000);
    }
  };

  // Cancel check-in
  const handleCancel = () => {
    setCheckInState("idle");
    setSelectedMember(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  // Format time
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatClassTime = (startsAt: string, endsAt: string) => {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    return `${formatTime(start)} - ${formatTime(end)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600 text-2xl animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col select-none overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          {(gymLogo || kioskSettings.logoUrl) && (
            <img src={gymLogo || kioskSettings.logoUrl} alt="Logo" className="h-10 md:h-12 object-contain" />
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{gymSettings.name}</h1>
            <p className="text-gray-500 text-sm">Member Check-In</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl md:text-4xl font-bold text-primary font-mono">
            {formatTime(currentTime)}
          </div>
          <div className="text-gray-500 text-sm">
            {currentTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row gap-4 p-4 md:p-6">
        {/* Left Panel - Class Selection */}
        <div className="w-full md:w-64 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <h2 className="text-gray-500 text-sm font-medium mb-3 uppercase tracking-wide">Today&apos;s Classes</h2>
            {todaysClasses.length === 0 ? (
              <p className="text-gray-400 text-sm">No classes scheduled today</p>
            ) : (
              <div className="space-y-2">
                {todaysClasses.map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => handleClassChange(cls)}
                    className={`w-full text-left p-3 rounded-xl transition-all ${
                      selectedClass?.id === cls.id
                        ? "bg-primary text-white shadow-md"
                        : "bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"
                    }`}
                  >
                    <div className="font-semibold text-sm">{cls.name}</div>
                    <div className="text-xs opacity-70">
                      {formatClassTime(cls.startsAt, cls.endsAt)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              if (kioskSettings.exitPin) {
                setShowPinModal(true);
                setPinInput("");
              } else {
                window.location.href = "/kiosk/settings";
              }
            }}
            className="w-full mt-3 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primaryDark transition-colors"
          >
            Back
          </button>
        </div>

        {/* Center Panel - Check-in Interface */}
        <div className="flex-1 flex items-center justify-center">
          {/* Idle State - Tap to Start */}
          {checkInState === "idle" && (
            <button
              onClick={() => setCheckInState("search")}
              className="w-full max-w-lg aspect-square bg-primary rounded-3xl shadow-xl flex flex-col items-center justify-center gap-6 hover:bg-primaryDark active:scale-[0.98] transition-all"
            >
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-16 h-16 md:w-20 md:h-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div className="text-center">
                {kioskSettings.welcomeMessage && (
                  <p className="text-white/90 text-xl md:text-2xl mb-3">{kioskSettings.welcomeMessage}</p>
                )}
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">TAP TO CHECK IN</h2>
                <p className="text-white/80 text-lg">
                  {selectedClass ? selectedClass.name : "Select a class"}
                </p>
              </div>
            </button>
          )}

          {/* Search State */}
          {checkInState === "search" && (
            <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-gray-200 p-6 md:p-8">
              <div className="text-center mb-6">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Find Your Name</h2>
                <p className="text-gray-500">Type your name, member number, or scan QR</p>
              </div>

              {/* Mode Toggle */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setScanMode(false)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${!scanMode ? "bg-primary text-white" : "bg-gray-100 text-gray-600"}`}
                >
                  Search
                </button>
                <button
                  onClick={() => setScanMode(true)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${scanMode ? "bg-primary text-white" : "bg-gray-100 text-gray-600"}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
                  </svg>
                  Scan QR
                </button>
              </div>

              {/* QR Scanner */}
              {scanMode && (
                <div className="mb-6">
                  <QrScanner onScan={handleQrScan} />
                </div>
              )}

              {/* Search Input + Results */}
              {!scanMode && (
                <>
                  <div className="relative mb-6">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && searchResults.length > 0) {
                          e.preventDefault();
                          handleSelectMember(searchResults[0]);
                        }
                      }}
                      placeholder="Start typing..."
                      autoFocus
                      className="w-full text-xl md:text-2xl px-6 py-4 rounded-2xl border-2 border-gray-200 focus:border-primary focus:outline-none transition-colors"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setSearchResults([]);
                        }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto">
                      {searchResults.map((member, idx) => {
                        const classRankInfo = getMemberRankForClass(member, selectedClass);
                        return (
                          <button
                            key={member.id}
                            onClick={() => handleSelectMember(member)}
                            className={`w-full text-left p-4 rounded-xl hover:bg-primary hover:text-white transition-colors flex items-center gap-4 border hover:border-primary ${idx === 0 ? "bg-primary/10 border-primary" : "bg-gray-50 border-gray-200"}`}
                          >
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">
                              {member.firstName[0]}{member.lastName[0]}
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-lg">{member.firstName} {member.lastName}</div>
                              {classRankInfo && (
                                <div className="text-sm opacity-70">
                                  <span className="mr-2">{classRankInfo.rank}</span>
                                  <span>{classRankInfo.styleName}</span>
                                </div>
                              )}
                            </div>
                            <svg className="w-6 h-6 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* No Results */}
                  {searchQuery.length >= 2 && searchResults.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-lg">No members found</p>
                      <p className="text-sm">Try a different search</p>
                    </div>
                  )}
                </>
              )}

              {/* Cancel Button */}
              <button
                onClick={handleCancel}
                className="w-full py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Confirm State */}
          {checkInState === "confirm" && selectedMember && (
            <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-gray-200 p-6 md:p-8 text-center">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-primary/10 flex items-center justify-center text-primary text-4xl md:text-5xl font-bold mx-auto mb-6">
                {selectedMember.firstName[0]}{selectedMember.lastName[0]}
              </div>

              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                {selectedMember.firstName} {selectedMember.lastName}
              </h2>

              {(() => {
                const confirmRankInfo = getMemberRankForClass(selectedMember, selectedClass);
                return confirmRankInfo ? (
                  <p className="text-gray-500 text-lg mb-6">
                    <span className="mr-2">{confirmRankInfo.rank}</span>
                    <span>• {confirmRankInfo.styleName}</span>
                  </p>
                ) : null;
              })()}

              <div className="bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-200">
                <p className="text-gray-500 text-sm mb-1">Checking in to</p>
                <p className="text-gray-900 font-semibold text-lg">{selectedClass?.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleCancel}
                  className="py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCheckIn}
                  className="py-4 rounded-2xl bg-primary text-white font-semibold text-lg hover:bg-primaryDark transition-colors"
                >
                  CHECK IN
                </button>
              </div>
            </div>
          )}

          {/* Success State */}
          {checkInState === "success" && selectedMember && (
            <div className="w-full max-w-lg bg-green-500 rounded-3xl shadow-xl p-8 md:p-12 text-center text-white">
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-6">
                <svg className="w-20 h-20 md:w-24 md:h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h2 className="text-3xl md:text-4xl font-bold mb-2">Welcome!</h2>
              <p className="text-2xl md:text-3xl font-semibold mb-4">
                {selectedMember.firstName} {selectedMember.lastName}
              </p>
              <p className="text-white/80 text-lg">You&apos;re checked in to {selectedClass?.name}</p>
            </div>
          )}

          {/* Error State */}
          {checkInState === "error" && (
            <div className="w-full max-w-lg bg-primary rounded-3xl shadow-xl p-8 md:p-12 text-center text-white">
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-6">
                <svg className="w-20 h-20 md:w-24 md:h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>

              <h2 className="text-3xl md:text-4xl font-bold mb-4">Oops!</h2>
              <p className="text-xl md:text-2xl">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Right Panel - Recent Check-ins */}
        <div className="w-full md:w-64 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <h2 className="text-gray-500 text-sm font-medium mb-3 uppercase tracking-wide">Recent Check-ins</h2>
            {recentCheckIns.length === 0 ? (
              <p className="text-gray-400 text-sm">No check-ins yet</p>
            ) : (
              <div className="space-y-2">
                {recentCheckIns.map((checkIn, i) => (
                  <div key={i} className="flex items-center gap-3 text-gray-700 text-sm">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="flex-1 truncate">
                      {checkIn.member.firstName} {checkIn.member.lastName}
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatTime(checkIn.time)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="text-gray-400 text-sm">
          Tap anywhere to check in • Ask staff for help if needed
        </div>
        <button
          onClick={() => {
            if (kioskSettings.exitPin) {
              setShowPinModal(true);
              setPinInput("");
            } else {
              window.location.href = "/kiosk/settings";
            }
          }}
          className="text-gray-400 hover:text-gray-600 text-sm transition-colors"
        >
          Exit Kiosk Mode
        </button>
      </footer>

      {/* Pin Code Exit Modal */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm mx-4">
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Enter Pin to Exit</h3>
            <p className="text-gray-500 text-sm text-center mb-6">Enter the kiosk exit pin code</p>

            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setPinInput(val);
                if (val && val === kioskSettings.exitPin) {
                  window.location.href = "/kiosk/settings";
                }
              }}
              placeholder="••••"
              maxLength={6}
              autoFocus
              className="w-full text-center text-3xl tracking-[0.5em] px-6 py-4 rounded-2xl border-2 border-gray-200 focus:border-primary focus:outline-none transition-colors mb-4"
            />

            {pinInput.length > 0 && pinInput !== kioskSettings.exitPin && pinInput.length >= kioskSettings.exitPin.length && (
              <p className="text-red-500 text-sm text-center mb-4">Incorrect pin</p>
            )}

            <div className="grid grid-cols-3 gap-3 mb-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "del"].map((key, i) => {
                if (key === null) return <div key={i} />;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (key === "del") {
                        setPinInput((prev) => prev.slice(0, -1));
                      } else {
                        const newPin = pinInput + String(key);
                        setPinInput(newPin);
                        if (newPin === kioskSettings.exitPin) {
                          window.location.href = "/kiosk/settings";
                        }
                      }
                    }}
                    className="py-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-xl font-semibold text-gray-800 transition-colors active:scale-95"
                  >
                    {key === "del" ? "⌫" : key}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                setShowPinModal(false);
                setPinInput("");
              }}
              className="w-full py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// QR Scanner component using html5-qrcode
function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const scannerInstanceRef = useRef<unknown>(null);
  const lastScanRef = useRef("");

  useEffect(() => {
    let mounted = true;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!mounted || !scannerRef.current) return;

        const scanner = new Html5Qrcode("qr-reader");
        scannerInstanceRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            // Debounce: don't fire the same code repeatedly
            if (decodedText === lastScanRef.current) return;
            lastScanRef.current = decodedText;
            onScan(decodedText);
            // Reset after 3 seconds so the same code can be scanned again
            setTimeout(() => { lastScanRef.current = ""; }, 3000);
          },
          () => {} // ignore errors (no QR found in frame)
        );
      } catch (err) {
        console.error("QR scanner error:", err);
      }
    }

    startScanner();

    return () => {
      mounted = false;
      const inst = scannerInstanceRef.current as { stop?: () => Promise<void>; clear?: () => void } | null;
      if (inst) {
        inst.stop?.().then(() => inst.clear?.()).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-gray-200">
      <div id="qr-reader" ref={scannerRef} className="w-full" />
      <p className="text-center text-sm text-gray-500 py-2">Point camera at QR code</p>
    </div>
  );
}
