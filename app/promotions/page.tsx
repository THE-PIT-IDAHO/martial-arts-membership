"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import Link from "next/link";
import { getTodayString } from "@/lib/dates";

type Rank = {
  id: string;
  name: string;
  order: number;
  classRequirement?: number | null;
  thumbnail?: string | null;
};

type Style = {
  id: string;
  name: string;
  beltConfig?: string | null;
  gradingDates?: string | null;
  ranks?: Rank[];
};

type MemberStyle = {
  name: string;
  rank?: string;
  startDate?: string;
  lastPromotionDate?: string;
  active?: boolean;
  attendanceResetDate?: string;
};

type Attendance = {
  id: string;
  checkedInAt: string;
  date?: string;
  source?: string;
  classSession?: {
    styleName?: string | null;
    styleNames?: string | null;
    classType?: string | null;
  } | null;
};

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  primaryStyle?: string | null;
  stylesNotes?: string | null;
  styleDocuments?: string | null;
  attendances?: Attendance[];
};

type StyleDocument = {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
};

type RankPdf = {
  name: string;
  url: string;
};

type BeltRank = {
  name: string;
  order: number;
  pdfDocuments?: RankPdf[];
};

type ClassRequirementProgress = {
  label: string;
  attended: number;
  required: number;
  met: boolean;
};

type EligibleMember = {
  member: Member;
  style: MemberStyle;
  styleConfig: Style;
  currentRank: Rank | null;
  nextRank: Rank;
  attendanceCount: number;
  requiredCount: number;
  classRequirements: ClassRequirementProgress[];
  nextGradingDate: string | null;
};

type PromotionParticipant = {
  id: string;
  memberId: string;
  memberName: string;
  currentRank?: string | null;
  promotingToRank?: string | null;
  status: string;
  notes?: string | null;
  promotedAt?: string | null;
  feeCharged?: boolean;
  transactionId?: string | null;
};

type TestResult = {
  id: string;
  status: string;
  score?: number | null;
  testingEvent: {
    id: string;
    name: string;
    date: string;
    styleName: string;
    status: string;
  };
};

type PromotionEvent = {
  id: string;
  name: string;
  date: string;
  time?: string | null;
  styleId: string;
  styleName: string;
  location?: string | null;
  notes?: string | null;
  costCents?: number | null;
  status: string;
  participants?: PromotionParticipant[];
};

function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}:00 ${period}` : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function parseEventDate(dateStr: string): Date {
  if (dateStr.includes("T")) {
    return new Date(dateStr);
  }
  return new Date(dateStr + "T12:00:00");
}

export default function PromotionsPage() {
  const [styles, setStyles] = useState<Style[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStyleFilter, setSelectedStyleFilter] = useState<string>("all");
  const [promoting, setPromoting] = useState<boolean>(false);

  // View mode: "eligible" or "events"
  const [viewMode, setViewMode] = useState<"eligible" | "events">("eligible");

  // Selection state
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());

  // Promotion modal state
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [promotionDate, setPromotionDate] = useState(getTodayString());
  const [promotionNotes, setPromotionNotes] = useState("");
  const [membersToPromote, setMembersToPromote] = useState<EligibleMember[]>([]);

  const [showIneligible, setShowIneligible] = useState(false);
  const [collapsedStyles, setCollapsedStyles] = useState<Set<string>>(new Set());

  // Promotion Events state
  const [promotionEvents, setPromotionEvents] = useState<PromotionEvent[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PromotionEvent | null>(null);
  const [eventForm, setEventForm] = useState({
    name: "",
    date: getTodayString(),
    time: "12:00",
    styleId: "",
    styleName: "",
    location: "",
    notes: "",
    cost: "",
  });
  const [savingEvent, setSavingEvent] = useState(false);

  // Event detail view state
  const [selectedEvent, setSelectedEvent] = useState<PromotionEvent | null>(null);
  const [showAddParticipantsModal, setShowAddParticipantsModal] = useState(false);
  const [showModalIneligible, setShowModalIneligible] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set());
  const [executingPromotions, setExecutingPromotions] = useState(false);
  const [chargingFees, setChargingFees] = useState(false);
  const [participantDiscounts, setParticipantDiscounts] = useState<Record<string, number>>({});
  const [participantTestResults, setParticipantTestResults] = useState<Record<string, TestResult | null>>({});

  // Load promotion events
  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/promotion-events");
      if (res.ok) {
        const data = await res.json();
        setPromotionEvents(data.events || []);
      }
    } catch (err) {
      console.error("Failed to load promotion events:", err);
    }
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [stylesRes, membersRes] = await Promise.all([
          fetch("/api/styles"),
          fetch("/api/members"),
        ]);

        if (stylesRes.ok) {
          const stylesData = await stylesRes.json();
          setStyles(stylesData.styles || []);
        }

        if (membersRes.ok) {
          const membersData = await membersRes.json();
          // Need to fetch full member data with attendances
          const fullMembers = await Promise.all(
            (membersData.members || []).map(async (m: Member) => {
              const res = await fetch(`/api/members/${m.id}`);
              if (res.ok) {
                const data = await res.json();
                return data.member;
              }
              return m;
            })
          );
          setMembers(fullMembers);
        }

        // Load promotion events
        await loadEvents();
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [loadEvents]);

  // Calculate eligible and ineligible members for promotion
  const eligibleMembers: EligibleMember[] = [];
  const ineligibleMembers: EligibleMember[] = [];

  members.forEach((member) => {
    if (!member.stylesNotes) return;

    let memberStyles: MemberStyle[] = [];
    try {
      memberStyles = JSON.parse(member.stylesNotes);
    } catch {
      return;
    }

    memberStyles
      .filter((s) => s.active !== false)
      .forEach((memberStyle) => {
        const styleConfig = styles.find(
          (st) => st.name.toLowerCase() === memberStyle.name.toLowerCase()
        );
        if (!styleConfig || !styleConfig.ranks) return;

        const sortedRanks = [...styleConfig.ranks].sort((a, b) => a.order - b.order);
        const currentRankIndex = sortedRanks.findIndex(
          (r) => r.name === memberStyle.rank
        );

        if (currentRankIndex < 0 || currentRankIndex >= sortedRanks.length - 1) {
          return; // No rank or already at highest
        }

        const nextRank = sortedRanks[currentRankIndex + 1];
        const currentRank = sortedRanks[currentRankIndex];

        // Count attendance for this style (only after reset date if set)
        const matchesStyle = (att: Attendance) => {
          if (!att.classSession) return false;

          // Filter out attendance before the reset date
          if (memberStyle.attendanceResetDate) {
            const attendanceDate = att.date || att.checkedInAt?.split("T")[0];
            if (attendanceDate && attendanceDate < memberStyle.attendanceResetDate) {
              return false;
            }
          }

          if (att.classSession.styleNames) {
            try {
              const names: string[] = JSON.parse(att.classSession.styleNames);
              return names.some(
                (n) => n.toLowerCase() === memberStyle.name.toLowerCase()
              );
            } catch {
              /* ignore */
            }
          }
          return (
            att.classSession.styleName?.toLowerCase() ===
            memberStyle.name.toLowerCase()
          );
        };

        const styleAttendances = (member.attendances || []).filter(
          (att) => matchesStyle(att) || att.source === "IMPORTED"
        );
        const attendanceCount = styleAttendances.length;

        // Parse individual class requirements from beltConfig (source of truth)
        let classRequirements: ClassRequirementProgress[] = [];
        let requiredCount = 0;

        if (styleConfig.beltConfig) {
          try {
            const beltConfig = typeof styleConfig.beltConfig === "string"
              ? JSON.parse(styleConfig.beltConfig)
              : styleConfig.beltConfig;
            if (beltConfig.ranks && Array.isArray(beltConfig.ranks)) {
              const nextBeltRank = beltConfig.ranks.find(
                (r: any) => r.name === nextRank.name
              );
              if (nextBeltRank?.classRequirements && Array.isArray(nextBeltRank.classRequirements)) {
                classRequirements = nextBeltRank.classRequirements
                  .filter((req: any) => req.label && req.minCount != null && req.minCount > 0)
                  .map((req: any) => {
                    const attended = styleAttendances.filter(
                      (att) => att.classSession?.classType?.toLowerCase() === req.label.toLowerCase()
                    ).length;
                    return {
                      label: req.label,
                      attended,
                      required: req.minCount,
                      met: attended >= req.minCount,
                    };
                  });
                requiredCount = classRequirements.reduce((sum, r) => sum + r.required, 0);
              }
            }
          } catch {
            /* ignore parse errors */
          }
        }

        // Fall back to Rank model's total classRequirement if beltConfig had nothing
        if (classRequirements.length === 0 && nextRank.classRequirement) {
          requiredCount = nextRank.classRequirement;
          classRequirements = [{
            label: "Classes",
            attended: attendanceCount,
            required: requiredCount,
            met: attendanceCount >= requiredCount,
          }];
        }

        // Eligible if all individual requirements are met (or no requirements configured)
        const allRequirementsMet = classRequirements.length === 0 || classRequirements.every((r) => r.met);

        // Get next grading date
        let nextGradingDate: string | null = null;
        if (styleConfig.gradingDates) {
          try {
            const gradingEvents = JSON.parse(styleConfig.gradingDates);
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const upcoming = gradingEvents
              .filter((e: { date: string }) => new Date(e.date + "T00:00:00") >= now)
              .sort(
                (a: { date: string }, b: { date: string }) =>
                  new Date(a.date).getTime() - new Date(b.date).getTime()
              );
            if (upcoming.length > 0) {
              nextGradingDate = upcoming[0].date;
            }
          } catch {
            /* ignore */
          }
        }

        const entry: EligibleMember = {
          member,
          style: memberStyle,
          styleConfig,
          currentRank,
          nextRank,
          attendanceCount,
          requiredCount,
          classRequirements,
          nextGradingDate,
        };

        if (allRequirementsMet) {
          eligibleMembers.push(entry);
        } else {
          ineligibleMembers.push(entry);
        }
      });
  });

  // Filter by style if selected
  const filteredEligible =
    selectedStyleFilter === "all"
      ? eligibleMembers
      : eligibleMembers.filter(
          (e) => e.styleConfig.name.toLowerCase() === selectedStyleFilter.toLowerCase()
        );

  // Filter ineligible by style too
  const filteredIneligible =
    selectedStyleFilter === "all"
      ? ineligibleMembers
      : ineligibleMembers.filter(
          (e) => e.styleConfig.name.toLowerCase() === selectedStyleFilter.toLowerCase()
        );

  // Combine eligible + ineligible when toggle is on
  const displayMembers = showIneligible
    ? [...filteredEligible, ...filteredIneligible]
    : filteredEligible;

  // Group by style for display
  const groupedByStyle: Record<string, EligibleMember[]> = {};
  displayMembers.forEach((e) => {
    const styleName = e.styleConfig.name;
    if (!groupedByStyle[styleName]) {
      groupedByStyle[styleName] = [];
    }
    groupedByStyle[styleName].push(e);
  });

  // Group by next rank for the promotion modal
  const groupedByNextRank: Record<string, EligibleMember[]> = {};
  membersToPromote.forEach((e) => {
    const key = `${e.styleConfig.name} - ${e.nextRank.name}`;
    if (!groupedByNextRank[key]) {
      groupedByNextRank[key] = [];
    }
    groupedByNextRank[key].push(e);
  });

  // Get unique style names from eligible members
  const stylesWithEligible = [...new Set(eligibleMembers.map((e) => e.styleConfig.name))];

  // Selection helpers
  const getKey = (eligible: EligibleMember) => `${eligible.member.id}-${eligible.style.name}`;

  const toggleSelection = (eligible: EligibleMember) => {
    const key = getKey(eligible);
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedMembers(new Set(filteredEligible.map(getKey)));
  };

  const clearSelection = () => {
    setSelectedMembers(new Set());
  };

  const getSelectedEligible = () => {
    return filteredEligible.filter(e => selectedMembers.has(getKey(e)));
  };

  // Open promotion modal
  const openPromotionModal = (members: EligibleMember[]) => {
    setMembersToPromote(members);
    setPromotionDate(getTodayString());
    setPromotionNotes("");
    setShowPromotionModal(true);
  };

  // Helper function to get rank PDFs from a style's beltConfig
  function getRankPdfsForPromotion(
    styleConfig: Style,
    targetRankName: string,
    currentStyleDocuments: string | null
  ): string {
    if (!styleConfig.beltConfig) {
      return currentStyleDocuments || "[]";
    }

    // Parse beltConfig
    let beltConfig: { ranks?: BeltRank[] };
    try {
      beltConfig = typeof styleConfig.beltConfig === "string"
        ? JSON.parse(styleConfig.beltConfig)
        : styleConfig.beltConfig;
    } catch {
      return currentStyleDocuments || "[]";
    }

    if (!beltConfig.ranks || !Array.isArray(beltConfig.ranks)) {
      return currentStyleDocuments || "[]";
    }

    // Find the target rank
    const targetRank = beltConfig.ranks.find((r) => r.name === targetRankName);
    if (!targetRank) {
      return currentStyleDocuments || "[]";
    }

    // Parse current style documents
    let currentDocs: StyleDocument[] = [];
    if (currentStyleDocuments) {
      try {
        currentDocs = JSON.parse(currentStyleDocuments);
      } catch {
        currentDocs = [];
      }
    }

    // Get all ranks up to and including the target rank (by order number)
    const ranksToInclude = beltConfig.ranks.filter((r) => r.order <= targetRank.order);

    let hasNewDocs = false;
    const updatedDocs = [...currentDocs];

    // Add PDFs from all these ranks
    for (const rank of ranksToInclude) {
      if (!rank.pdfDocuments || rank.pdfDocuments.length === 0) continue;

      for (const rankPdf of rank.pdfDocuments) {
        // Check if this PDF already exists (by name)
        const exists = updatedDocs.some((doc) => doc.name === rankPdf.name);
        if (!exists) {
          const newDoc: StyleDocument = {
            id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: rankPdf.name,
            url: rankPdf.url,
            uploadedAt: new Date().toISOString(),
          };
          updatedDocs.push(newDoc);
          hasNewDocs = true;
        }
      }
    }

    return hasNewDocs ? JSON.stringify(updatedDocs) : (currentStyleDocuments || "[]");
  }

  // Execute promotions
  async function executePromotions() {
    if (membersToPromote.length === 0) return;

    setPromoting(true);

    try {
      for (const eligible of membersToPromote) {
        // Parse current styles
        const memberStyles: MemberStyle[] = JSON.parse(eligible.member.stylesNotes || "[]");

        // Update the specific style with new rank and reset attendance tracking
        const updatedStyles = memberStyles.map((s) =>
          s.name.toLowerCase() === eligible.style.name.toLowerCase()
            ? { ...s, rank: eligible.nextRank.name, lastPromotionDate: promotionDate, attendanceResetDate: promotionDate }
            : s
        );

        // Get rank PDFs for this promotion
        const updatedStyleDocuments = getRankPdfsForPromotion(
          eligible.styleConfig,
          eligible.nextRank.name,
          eligible.member.styleDocuments || null
        );

        // Build the update payload
        const updatePayload: Record<string, any> = {
          stylesNotes: JSON.stringify(updatedStyles),
          styleDocuments: updatedStyleDocuments,
        };

        // If the promoted style is the member's primary style, also update the rank field
        const isPrimaryStyle = eligible.member.primaryStyle?.toLowerCase() === eligible.style.name.toLowerCase();
        if (isPrimaryStyle) {
          updatePayload.rank = eligible.nextRank.name;
        }

        // Also update primaryStyle if it's the first style (in case it wasn't set)
        const primaryStyle = updatedStyles[0];
        if (primaryStyle && primaryStyle.name.toLowerCase() === eligible.style.name.toLowerCase()) {
          updatePayload.primaryStyle = primaryStyle.name;
          updatePayload.rank = eligible.nextRank.name;
        }

        const patchRes = await fetch(`/api/members/${eligible.member.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatePayload),
        });

        if (!patchRes.ok) {
          console.error(`Failed to update member ${eligible.member.id}:`, await patchRes.text());
        }
      }

      // Refresh all member data
      const membersRes = await fetch("/api/members");
      if (membersRes.ok) {
        const membersData = await membersRes.json();
        const fullMembers = await Promise.all(
          (membersData.members || []).map(async (m: Member) => {
            const res = await fetch(`/api/members/${m.id}`);
            if (res.ok) {
              const data = await res.json();
              return data.member;
            }
            return m;
          })
        );
        setMembers(fullMembers);
      }

      // Clear selection and close modal
      setSelectedMembers(new Set());
      setShowPromotionModal(false);
      setMembersToPromote([]);
    } catch (err) {
      console.error("Failed to promote:", err);
      alert("Failed to complete promotions. Please try again.");
    } finally {
      setPromoting(false);
    }
  }

  // Get belt color for a rank
  function getBeltColor(styleConfig: Style, rankName: string): string {
    if (!styleConfig.beltConfig) return "#9ca3af";
    try {
      const beltConfig = JSON.parse(styleConfig.beltConfig);
      const entry = beltConfig.find((b: { rankName: string }) => b.rankName === rankName);
      if (entry?.colors?.[0]) return entry.colors[0];
    } catch {
      /* ignore */
    }
    return "#9ca3af";
  }

  // Get belt thumbnail for a rank
  function getBeltThumbnail(styleConfig: Style, rankName: string): string | null {
    if (!styleConfig.beltConfig) return null;
    try {
      const beltConfig = JSON.parse(styleConfig.beltConfig);
      const entry = beltConfig.find((b: { rankName: string }) => b.rankName === rankName);
      return entry?.thumbnail || null;
    } catch {
      return null;
    }
  }

  // Open event modal for creating new event
  const openCreateEventModal = () => {
    setEditingEvent(null);
    setEventForm({
      name: "",
      date: getTodayString(),
      time: "12:00",
      styleId: styles[0]?.id || "",
      styleName: styles[0]?.name || "",
      location: "",
      notes: "",
      cost: "",
    });
    setShowEventModal(true);
  };

  // Open event modal for editing
  const openEditEventModal = (event: PromotionEvent) => {
    setEditingEvent(event);
    setEventForm({
      name: event.name,
      date: event.date.split("T")[0],
      time: event.time || "",
      styleId: event.styleId,
      styleName: event.styleName,
      location: event.location || "",
      notes: event.notes || "",
      cost: event.costCents ? (event.costCents / 100).toFixed(2) : "",
    });
    setShowEventModal(true);
  };

  // Save event (create or update)
  const saveEvent = async () => {
    if (!eventForm.name.trim() || !eventForm.styleId) {
      alert("Please enter an event name and select a style.");
      return;
    }

    setSavingEvent(true);
    try {
      const selectedStyle = styles.find(s => s.id === eventForm.styleId);
      const costCents = eventForm.cost ? Math.round(parseFloat(eventForm.cost) * 100) : null;
      const payload = {
        ...eventForm,
        styleName: selectedStyle?.name || eventForm.styleName,
        costCents,
      };

      if (editingEvent) {
        // Update existing event
        const res = await fetch(`/api/promotion-events/${editingEvent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to update event");
      } else {
        // Create new event
        const res = await fetch("/api/promotion-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to create event");
      }

      await loadEvents();
      setShowEventModal(false);
    } catch (err) {
      console.error("Failed to save event:", err);
      alert("Failed to save promotion event. Please try again.");
    } finally {
      setSavingEvent(false);
    }
  };

  // Delete event
  const deleteEvent = async (eventId: string) => {
    if (!confirm("Are you sure you want to delete this promotion event?")) return;

    try {
      const res = await fetch(`/api/promotion-events/${eventId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete event");

      await loadEvents();
      if (selectedEvent?.id === eventId) {
        setSelectedEvent(null);
      }
    } catch (err) {
      console.error("Failed to delete event:", err);
      alert("Failed to delete promotion event. Please try again.");
    }
  };

  // Load event details with participants
  const loadEventDetails = async (eventId: string) => {
    try {
      const res = await fetch(`/api/promotion-events/${eventId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedEvent(data.event);

        // Fetch discount info and test results for each participant
        const participants = data.event.participants || [];
        const discounts: Record<string, number> = {};
        const testResults: Record<string, TestResult | null> = {};
        const styleName = data.event.styleName;

        for (const participant of participants) {
          try {
            // Get member's active memberships
            const membershipsRes = await fetch(`/api/memberships?memberId=${participant.memberId}&status=ACTIVE`);
            if (membershipsRes.ok) {
              const membershipsData = await membershipsRes.json();
              const memberships = membershipsData.memberships || [];

              // Find the highest promotion fee discount from their active membership plans
              let maxDiscount = 0;
              for (const membership of memberships) {
                const planDiscount = membership.membershipPlan?.rankPromotionDiscountPercent || 0;
                if (planDiscount > maxDiscount) {
                  maxDiscount = planDiscount;
                }
              }
              discounts[participant.memberId] = maxDiscount;
            }

            // Get member's most recent test result for this style
            const testRes = await fetch(`/api/members/${participant.memberId}/test-results?styleName=${encodeURIComponent(styleName)}&limit=1`);
            if (testRes.ok) {
              const testData = await testRes.json();
              testResults[participant.memberId] = testData.testResults?.[0] || null;
            }
          } catch {
            // Ignore errors for individual participants
          }
        }

        setParticipantDiscounts(discounts);
        setParticipantTestResults(testResults);
      }
    } catch (err) {
      console.error("Failed to load event details:", err);
    }
  };

  // Add participants to event
  const addParticipantsToEvent = async (members: EligibleMember[]) => {
    if (!selectedEvent) return;

    try {
      for (const eligible of members) {
        await fetch(`/api/promotion-events/${selectedEvent.id}/participants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: eligible.member.id,
            memberName: `${eligible.member.firstName} ${eligible.member.lastName}`,
            currentRank: eligible.currentRank?.name || null,
            promotingToRank: eligible.nextRank.name,
          }),
        });
      }

      await loadEventDetails(selectedEvent.id);
      await loadEvents();
      setShowAddParticipantsModal(false);
      setSelectedParticipants(new Set());
    } catch (err) {
      console.error("Failed to add participants:", err);
      alert("Failed to add participants. Please try again.");
    }
  };

  // Remove participant from event
  const removeParticipant = async (participantId: string) => {
    if (!selectedEvent) return;

    try {
      await fetch(`/api/promotion-events/${selectedEvent.id}/participants?participantId=${participantId}`, {
        method: "DELETE",
      });

      await loadEventDetails(selectedEvent.id);
      await loadEvents();
    } catch (err) {
      console.error("Failed to remove participant:", err);
      alert("Failed to remove participant. Please try again.");
    }
  };

  // Execute promotions for event participants
  const executeEventPromotions = async (participantIds?: string[]) => {
    if (!selectedEvent) return;

    setExecutingPromotions(true);
    try {
      const res = await fetch(`/api/promotion-events/${selectedEvent.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds,
          promotionDate: selectedEvent.date.split("T")[0],
        }),
      });

      if (!res.ok) throw new Error("Failed to execute promotions");

      const data = await res.json();
      alert(`Successfully promoted ${data.promoted} member${data.promoted !== 1 ? "s" : ""}${data.failed > 0 ? `. ${data.failed} failed.` : "."}`);

      await loadEventDetails(selectedEvent.id);
      await loadEvents();

      // Refresh member data
      const membersRes = await fetch("/api/members");
      if (membersRes.ok) {
        const membersData = await membersRes.json();
        const fullMembers = await Promise.all(
          (membersData.members || []).map(async (m: Member) => {
            const memberRes = await fetch(`/api/members/${m.id}`);
            if (memberRes.ok) {
              const memberData = await memberRes.json();
              return memberData.member;
            }
            return m;
          })
        );
        setMembers(fullMembers);
      }
    } catch (err) {
      console.error("Failed to execute promotions:", err);
      alert("Failed to execute promotions. Please try again.");
    } finally {
      setExecutingPromotions(false);
    }
  };

  // Charge promotion fees to participants
  const chargeEventFees = async (participantIds?: string[]) => {
    if (!selectedEvent || !selectedEvent.costCents) return;

    const uncharged = selectedEvent.participants?.filter(p => !p.feeCharged && p.status !== "CANCELLED") || [];
    const toCharge = participantIds
      ? uncharged.filter(p => participantIds.includes(p.id))
      : uncharged;

    if (toCharge.length === 0) {
      alert("No participants to charge.");
      return;
    }

    const costFormatted = (selectedEvent.costCents / 100).toFixed(2);
    if (!confirm(`Charge $${costFormatted} to ${toCharge.length} participant${toCharge.length !== 1 ? "s" : ""}?`)) {
      return;
    }

    setChargingFees(true);
    try {
      const res = await fetch(`/api/promotion-events/${selectedEvent.id}/charge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds: participantIds || toCharge.map(p => p.id),
          paymentMethod: "ACCOUNT",
        }),
      });

      if (!res.ok) throw new Error("Failed to charge fees");

      const data = await res.json();
      alert(`Successfully charged ${data.charged} member${data.charged !== 1 ? "s" : ""}${data.failed > 0 ? `. ${data.failed} failed.` : "."}`);

      await loadEventDetails(selectedEvent.id);
      await loadEvents();
    } catch (err) {
      console.error("Failed to charge fees:", err);
      alert("Failed to charge fees. Please try again.");
    } finally {
      setChargingFees(false);
    }
  };

  // Get eligible members for a specific event (matching style and not already added)
  const getEligibleForEvent = (event: PromotionEvent, includeIneligible = false) => {
    const existingMemberIds = new Set(event.participants?.map(p => p.memberId) || []);
    const pool = includeIneligible ? [...eligibleMembers, ...ineligibleMembers] : eligibleMembers;
    return pool.filter(
      e => e.styleConfig.name.toLowerCase() === event.styleName.toLowerCase() && !existingMemberIds.has(e.member.id)
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Loading...</p>
        </div>
      </AppLayout>
    );
  }

  const selectedCount = selectedMembers.size;

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Promotions</h1>
            <p className="text-sm text-gray-500">
              {viewMode === "eligible"
                ? `${eligibleMembers.length} member${eligibleMembers.length !== 1 ? "s" : ""} eligible for promotion`
                : `${promotionEvents.length} promotion event${promotionEvents.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {viewMode === "eligible" && stylesWithEligible.length > 1 && (
              <select
                value={selectedStyleFilter}
                onChange={(e) => {
                  setSelectedStyleFilter(e.target.value);
                  setSelectedMembers(new Set());
                }}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Styles ({eligibleMembers.length})</option>
                {stylesWithEligible.map((styleName) => (
                  <option key={styleName} value={styleName}>
                    {styleName} ({eligibleMembers.filter((e) => e.styleConfig.name === styleName).length})
                  </option>
                ))}
              </select>
            )}
            {viewMode === "events" && (
              <button
                onClick={openCreateEventModal}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
              >
                New Event
              </button>
            )}
            <Link
              href="/grading"
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors"
            >
              Grading Dates
            </Link>
          </div>
        </div>

        {/* View Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-4" aria-label="Tabs">
            <button
              onClick={() => { setViewMode("eligible"); setSelectedEvent(null); }}
              className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${
                viewMode === "eligible"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Eligible Members
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                viewMode === "eligible" ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-600"
              }`}>
                {eligibleMembers.length}
              </span>
            </button>
            <button
              onClick={() => setViewMode("events")}
              className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${
                viewMode === "events"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Promotion Events
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                viewMode === "events" ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-600"
              }`}>
                {promotionEvents.length}
              </span>
            </button>
          </nav>
        </div>

        {viewMode === "eligible" && (
          <div className="flex justify-start mt-2">
            <button
              type="button"
              onClick={() => setShowIneligible(!showIneligible)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark transition-colors"
            >
              {showIneligible ? "Hide" : "Show"} Ineligible
            </button>
          </div>
        )}

        {/* Eligible Members View */}
        {viewMode === "eligible" && (
          <>
        {displayMembers.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">
              No members are currently eligible for promotion
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Members become eligible when they meet the class attendance requirements for their next rank.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedByStyle).map(([styleName, styleEligible]) => {
              const styleConfig = styleEligible[0]?.styleConfig;
              const nextGrading = styleEligible[0]?.nextGradingDate;

              // Group by next rank within this style
              const byNextRank: Record<string, EligibleMember[]> = {};
              styleEligible.forEach(e => {
                if (!byNextRank[e.nextRank.name]) {
                  byNextRank[e.nextRank.name] = [];
                }
                byNextRank[e.nextRank.name].push(e);
              });

              return (
                <div key={styleName} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  {/* Style Header */}
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={styleEligible.length > 0 && styleEligible.every(e => selectedMembers.has(getKey(e)))}
                          onChange={(e) => {
                            setSelectedMembers(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) {
                                styleEligible.forEach(el => next.add(getKey(el)));
                              } else {
                                styleEligible.forEach(el => next.delete(getKey(el)));
                              }
                              return next;
                            });
                          }}
                          className="w-4 h-4 rounded border-gray-300 accent-primary focus:ring-primary"
                        />
                        <h2 className="text-lg font-semibold">{styleName}</h2>
                      </label>
                      <button
                        type="button"
                        onClick={() => setCollapsedStyles(prev => {
                          const next = new Set(prev);
                          if (next.has(styleName)) {
                            next.delete(styleName);
                          } else {
                            next.add(styleName);
                          }
                          return next;
                        })}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <svg
                          className={`w-5 h-5 transition-transform ${collapsedStyles.has(styleName) ? "-rotate-90" : ""}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {nextGrading && (
                        <div className="text-sm mr-2">
                          <span className="text-gray-500">Next Grading:</span>{" "}
                          <span className="font-medium text-primary">
                            {new Date(nextGrading + "T00:00:00").toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      )}
                      {(() => {
                        const styleSelectedCount = styleEligible.filter(e => selectedMembers.has(getKey(e))).length;
                        if (styleSelectedCount === 0) return null;
                        return (
                          <>
                            <button
                              onClick={() => {
                                const selected = styleEligible.filter(e => selectedMembers.has(getKey(e)));
                                openPromotionModal(selected);
                              }}
                              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                            >
                              Promote Selected ({styleSelectedCount})
                            </button>
                            <button
                              onClick={() => {
                                setSelectedMembers(prev => {
                                  const next = new Set(prev);
                                  styleEligible.forEach(el => next.delete(getKey(el)));
                                  return next;
                                });
                              }}
                              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                            >
                              Clear
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Grouped by Next Rank */}
                  {!collapsedStyles.has(styleName) && <div className="divide-y divide-gray-100">
                    {Object.entries(byNextRank).map(([rankName, rankEligible]) => {
                      const nextBeltColor = getBeltColor(styleConfig, rankName);
                      const nextBeltThumbnail = getBeltThumbnail(styleConfig, rankName);

                      return (
                        <div key={rankName}>
                          {/* Rank Header */}
                          <div className="bg-gray-50/50 px-4 py-2 flex items-center gap-3 border-b border-gray-100">
                            {nextBeltThumbnail ? (
                              <img src={nextBeltThumbnail} alt="" className="w-8 h-4 object-contain" />
                            ) : (
                              <div
                                className="w-8 h-3 rounded border border-primary/30"
                                style={{ backgroundColor: "#c41111" }}
                              />
                            )}
                            <span className="text-sm font-semibold text-gray-700">
                              Promoting to {rankName}
                            </span>
                            <span className="text-xs text-gray-500">
                              ({rankEligible.length} member{rankEligible.length !== 1 ? "s" : ""})
                            </span>
                            <button
                              onClick={() => openPromotionModal(rankEligible)}
                              className="ml-auto rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                            >
                              Promote All
                            </button>
                          </div>

                          {/* Members in this rank group */}
                          <div className="divide-y divide-gray-50">
                            {rankEligible.map((eligible) => {
                              const key = getKey(eligible);
                              const isSelected = selectedMembers.has(key);
                              const currentBeltColor = getBeltColor(styleConfig, eligible.currentRank?.name || "");

                              const isIneligible = eligible.classRequirements.length > 0 && !eligible.classRequirements.every((r) => r.met);

                              return (
                                <div
                                  key={key}
                                  className={`px-4 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                                >
                                  {/* Checkbox */}
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelection(eligible)}
                                    className="w-4 h-4 rounded border-gray-300 accent-primary focus:ring-primary"
                                  />

                                  {/* Member Photo/Avatar */}
                                  <Link href={`/members/${eligible.member.id}`} className="shrink-0">
                                    {eligible.member.photoUrl ? (
                                      <img
                                        src={eligible.member.photoUrl}
                                        alt=""
                                        className="w-10 h-10 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium">
                                        {eligible.member.firstName?.[0]}
                                        {eligible.member.lastName?.[0]}
                                      </div>
                                    )}
                                  </Link>

                                  {/* Member Info */}
                                  <div className="flex-1 min-w-0">
                                    <Link
                                      href={`/members/${eligible.member.id}`}
                                      className="font-medium text-gray-900 hover:text-primary truncate block"
                                    >
                                      {eligible.member.firstName} {eligible.member.lastName}
                                    </Link>
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                      <div className="flex items-center gap-1">
                                        <div
                                          className="w-2.5 h-2.5 rounded-full border border-gray-300"
                                          style={{ backgroundColor: currentBeltColor }}
                                        />
                                        <span className="text-xs">{eligible.currentRank?.name || "No rank"}</span>
                                      </div>
                                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                      <div className="flex items-center gap-1">
                                        <div
                                          className="w-2.5 h-2.5 rounded-full border border-gray-300"
                                          style={{ backgroundColor: nextBeltColor }}
                                        />
                                        <span className="text-xs font-medium text-gray-700">{eligible.nextRank.name}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Stats - individual class requirements */}
                                  <div className="text-right shrink-0">
                                    {eligible.classRequirements.length > 0 ? (
                                      <div className="text-xs font-medium text-green-600">
                                        {eligible.classRequirements.map((req, idx) => (
                                          <span key={idx} className={req.met ? "text-green-600" : "text-red-600"}>
                                            {idx > 0 && <span className="text-gray-400">{" "}-{" "}</span>}
                                            {req.label}: {req.attended}/{req.required}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-xs font-medium text-green-600">
                                        No requirements
                                      </div>
                                    )}
                                    {eligible.style.lastPromotionDate && (
                                      <div className="text-xs text-gray-400">
                                        Last promoted: {new Date(eligible.style.lastPromotionDate + "T00:00:00").toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>

                                  {/* Individual Promote Button */}
                                  <button
                                    onClick={() => openPromotionModal([eligible])}
                                    className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors"
                                  >
                                    Promote
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>}
                </div>
              );
            })}
          </div>
        )}
          </>
        )}

        {/* Promotion Events View */}
        {viewMode === "events" && !selectedEvent && (
          <div className="space-y-4">
            {promotionEvents.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">No promotion events yet</p>
                <p className="text-sm text-gray-400 mt-2">
                  Create a promotion event to organize and track belt promotions.
                </p>
                <button
                  onClick={openCreateEventModal}
                  className="mt-4 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Create First Event
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {promotionEvents.map((event) => {
                  const styleConfig = styles.find(s => s.name.toLowerCase() === event.styleName.toLowerCase());
                  const participantCount = event.participants?.length || 0;
                  const promotedCount = event.participants?.filter(p => p.status === "PROMOTED").length || 0;
                  const isCompleted = event.status === "COMPLETED";

                  return (
                    <div
                      key={event.id}
                      className={`rounded-lg border bg-white overflow-hidden ${
                        isCompleted ? "border-green-200" : "border-gray-200"
                      }`}
                    >
                      <div className={`px-4 py-3 border-b ${isCompleted ? "bg-green-50 border-green-200" : "bg-gray-50"}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-gray-900">{event.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                {event.styleName}
                              </span>
                              {isCompleted && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                  Completed
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditEventModal(event)}
                              className="p-1 text-gray-400 hover:text-gray-600"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => deleteEvent(event.id)}
                              className="p-1 text-gray-400 hover:text-primary"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>
                            {parseEventDate(event.date).toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                            {event.time && ` at ${formatTime12h(event.time)}`}
                          </span>
                        </div>

                        {event.location && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{event.location}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <span>
                            {participantCount} participant{participantCount !== 1 ? "s" : ""}
                            {promotedCount > 0 && ` (${promotedCount} promoted)`}
                          </span>
                        </div>

                        {event.costCents && event.costCents > 0 && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-medium text-green-600">
                              ${(event.costCents / 100).toFixed(2)}
                            </span>
                          </div>
                        )}

                        <button
                          onClick={() => loadEventDetails(event.id)}
                          className="w-full mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          Edit Members
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Event Detail View */}
        {viewMode === "events" && selectedEvent && (
          <div className="space-y-4">
            {/* Back Button */}
            <button
              onClick={() => setSelectedEvent(null)}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Events
            </button>

            {/* Event Header */}
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">{selectedEvent.name}</h2>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                    <span className="font-medium text-primary">{selectedEvent.styleName}</span>
                    <span>•</span>
                    <span>
                      {parseEventDate(selectedEvent.date).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {selectedEvent.time && ` at ${formatTime12h(selectedEvent.time)}`}
                    </span>
                    {selectedEvent.location && (
                      <>
                        <span>•</span>
                        <span>{selectedEvent.location}</span>
                      </>
                    )}
                    {selectedEvent.costCents && selectedEvent.costCents > 0 && (
                      <>
                        <span>•</span>
                        <span className="font-medium text-green-600">
                          ${(selectedEvent.costCents / 100).toFixed(2)} fee
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium px-3 py-1 rounded-full bg-primary/10 text-primary">
                    {selectedEvent.status === "COMPLETED" ? "Completed" : "Scheduled"}
                  </span>
                </div>
              </div>

              {selectedEvent.notes && (
                <div className="px-6 py-3 bg-yellow-50 border-b text-sm text-gray-700">
                  <span className="font-medium">Notes:</span> {selectedEvent.notes}
                </div>
              )}
            </div>

            {/* Participants Section */}
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Participants</h3>
                  <span className="text-sm text-gray-500">
                    ({selectedEvent.participants?.length || 0})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedEvent.status !== "COMPLETED" && (
                    <>
                      <button
                        onClick={() => {
                          setSelectedParticipants(new Set());
                          setShowModalIneligible(false);
                          setShowAddParticipantsModal(true);
                        }}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                      >
                        Add Members
                      </button>
                      {selectedEvent.costCents && selectedEvent.costCents > 0 && (selectedEvent.participants?.filter(p => !p.feeCharged && p.status !== "CANCELLED").length || 0) > 0 && (
                        <button
                          onClick={() => chargeEventFees()}
                          disabled={chargingFees}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                        >
                          {chargingFees ? "Charging..." : "Charge All"}
                        </button>
                      )}
                      {(selectedEvent.participants?.filter(p => p.status === "REGISTERED").length || 0) > 0 && (
                        <button
                          onClick={() => executeEventPromotions()}
                          disabled={executingPromotions}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                        >
                          {executingPromotions ? "Promoting..." : "Promote All"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {!selectedEvent.participants?.length ? (
                <div className="p-8 text-center text-gray-500">
                  <p className="font-medium">No participants yet</p>
                  <p className="text-sm mt-1">Add eligible members to this promotion event.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {selectedEvent.participants.map((participant) => {
                    const styleConfig = styles.find(s => s.name.toLowerCase() === selectedEvent.styleName.toLowerCase());
                    const currentBeltColor = getBeltColor(styleConfig || ({} as Style), participant.currentRank || "");
                    const nextBeltColor = getBeltColor(styleConfig || ({} as Style), participant.promotingToRank || "");

                    return (
                      <div key={participant.id} className="px-4 py-3 flex items-center gap-4">
                        {/* Status indicator */}
                        <div className={`w-2 h-2 rounded-full ${
                          participant.status === "PROMOTED" ? "bg-green-500" :
                          participant.status === "CANCELLED" ? "bg-red-500" : "bg-blue-500"
                        }`} />

                        {/* Member info */}
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/members/${participant.memberId}`}
                            className="font-medium text-gray-900 hover:text-primary"
                          >
                            {participant.memberName}
                          </Link>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2.5 h-2.5 rounded-full border border-gray-300"
                                style={{ backgroundColor: currentBeltColor }}
                              />
                              <span className="text-xs">{participant.currentRank || "No rank"}</span>
                            </div>
                            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2.5 h-2.5 rounded-full border border-gray-300"
                                style={{ backgroundColor: nextBeltColor }}
                              />
                              <span className="text-xs font-medium text-gray-700">{participant.promotingToRank || "N/A"}</span>
                            </div>
                          </div>
                          {/* Recent test result */}
                          {(() => {
                            const testResult = participantTestResults[participant.memberId];
                            if (!testResult) {
                              return (
                                <div className="text-xs text-gray-400 mt-1">
                                  No test on record
                                </div>
                              );
                            }
                            const testDate = new Date(testResult.testingEvent.date).toLocaleDateString();
                            const status = testResult.status.toUpperCase();
                            return (
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                  status === "PASSED" ? "bg-green-100 text-green-700" :
                                  status === "FAILED" ? "bg-red-100 text-red-700" :
                                  "bg-yellow-100 text-yellow-700"
                                }`}>
                                  {status === "PASSED" ? "Passed" :
                                   status === "FAILED" ? "Failed" : "Incomplete"}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {testDate}
                                </span>
                                {testResult.score !== null && testResult.score !== undefined && (
                                  <span className="text-xs text-gray-500">
                                    ({testResult.score}%)
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Fee and Status badges */}
                        <div className="flex items-center gap-2">
                          {selectedEvent.costCents && selectedEvent.costCents > 0 && (
                            (() => {
                              const discount = participantDiscounts[participant.memberId] || 0;
                              const originalFee = selectedEvent.costCents / 100;
                              const discountedFee = originalFee * (1 - discount / 100);
                              const hasDiscount = discount > 0;

                              return (
                                <div className="text-right">
                                  {hasDiscount ? (
                                    <>
                                      <div className="text-xs font-semibold text-green-600">
                                        ${discountedFee.toFixed(2)}
                                      </div>
                                      <div className="text-[10px] text-gray-400 line-through">
                                        ${originalFee.toFixed(2)}
                                      </div>
                                      <div className="text-[10px] text-green-500">
                                        {discount}% off
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-xs font-semibold text-gray-700">
                                      ${originalFee.toFixed(2)}
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          )}
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                              {participant.status === "PROMOTED" ? "Promoted" :
                               participant.status === "CANCELLED" ? "Cancelled" : "Registered"}
                            </span>
                            {selectedEvent.costCents && selectedEvent.costCents > 0 && (
                              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                participant.feeCharged ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                              }`}>
                                {participant.feeCharged ? "Paid" : "Unpaid"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        {participant.status === "REGISTERED" && selectedEvent.status !== "COMPLETED" && (
                          <div className="flex items-center gap-2">
                            {selectedEvent.costCents && selectedEvent.costCents > 0 && !participant.feeCharged && (
                              <button
                                onClick={() => chargeEventFees([participant.id])}
                                disabled={chargingFees}
                                className="rounded-md border border-yellow-600 text-yellow-600 px-2 py-1 text-xs font-semibold hover:bg-yellow-50 disabled:opacity-50"
                              >
                                Charge
                              </button>
                            )}
                            <button
                              onClick={() => executeEventPromotions([participant.id])}
                              disabled={executingPromotions}
                              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                            >
                              Promote
                            </button>
                            <button
                              onClick={() => removeParticipant(participant.id)}
                              className="text-gray-400 hover:text-primary"
                              title="Remove"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Promotion Modal */}
      {showPromotionModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => !promoting && setShowPromotionModal(false)} />

            <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b bg-gradient-to-r from-primary to-primaryDark">
                <h2 className="text-xl font-bold text-white">
                  Promote to Next Rank
                </h2>
                <p className="text-red-100 text-sm mt-1">
                  {membersToPromote.length} member{membersToPromote.length !== 1 ? "s" : ""} selected for promotion
                </p>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Promotion Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Promotion Date
                  </label>
                  <input
                    type="date"
                    value={promotionDate}
                    onChange={(e) => setPromotionDate(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full max-w-xs"
                  />
                </div>

                {/* Members to Promote - Grouped by Rank */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Members Being Promoted
                  </label>
                  <div className="space-y-4">
                    {Object.entries(groupedByNextRank).map(([rankKey, rankMembers]) => {
                      const firstMember = rankMembers[0];
                      const nextBeltColor = getBeltColor(firstMember.styleConfig, firstMember.nextRank.name);
                      const nextBeltThumbnail = getBeltThumbnail(firstMember.styleConfig, firstMember.nextRank.name);

                      return (
                        <div key={rankKey} className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="bg-gray-50 px-4 py-2 flex items-center gap-3 border-b">
                            {nextBeltThumbnail ? (
                              <img src={nextBeltThumbnail} alt="" className="w-10 h-5 object-contain" />
                            ) : (
                              <div
                                className="w-10 h-4 rounded border border-gray-300"
                                style={{ backgroundColor: nextBeltColor }}
                              />
                            )}
                            <div>
                              <div className="text-sm font-semibold text-gray-800">{rankKey}</div>
                              <div className="text-xs text-gray-500">{rankMembers.length} member{rankMembers.length !== 1 ? "s" : ""}</div>
                            </div>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {rankMembers.map((eligible) => {
                              const currentBeltColor = getBeltColor(eligible.styleConfig, eligible.currentRank?.name || "");
                              return (
                                <div key={getKey(eligible)} className="px-4 py-2 flex items-center gap-3">
                                  {eligible.member.photoUrl ? (
                                    <img
                                      src={eligible.member.photoUrl}
                                      alt=""
                                      className="w-8 h-8 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium">
                                      {eligible.member.firstName?.[0]}
                                      {eligible.member.lastName?.[0]}
                                    </div>
                                  )}
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-gray-900">
                                      {eligible.member.firstName} {eligible.member.lastName}
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-gray-500">
                                      <div
                                        className="w-2 h-2 rounded-full border border-gray-300"
                                        style={{ backgroundColor: currentBeltColor }}
                                      />
                                      <span>{eligible.currentRank?.name}</span>
                                      <span className="mx-1">→</span>
                                      <div
                                        className="w-2 h-2 rounded-full border border-gray-300"
                                        style={{ backgroundColor: nextBeltColor }}
                                      />
                                      <span className="font-medium">{eligible.nextRank.name}</span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setMembersToPromote(prev => prev.filter(m => getKey(m) !== getKey(eligible)));
                                      if (membersToPromote.length === 1) {
                                        setShowPromotionModal(false);
                                      }
                                    }}
                                    className="text-gray-400 hover:text-primary"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={promotionNotes}
                    onChange={(e) => setPromotionNotes(e.target.value)}
                    placeholder="Add any notes about this promotion..."
                    rows={3}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
                <button
                  onClick={() => setShowPromotionModal(false)}
                  disabled={promoting}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={executePromotions}
                  disabled={promoting || membersToPromote.length === 0}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 flex items-center gap-2"
                >
                  {promoting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Promoting...
                    </>
                  ) : (
                    <>
                      Confirm Promotion{membersToPromote.length > 1 ? "s" : ""}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => !savingEvent && setShowEventModal(false)} />

            <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b bg-gray-50">
                <h2 className="text-lg font-bold">
                  {editingEvent ? "Edit Promotion Event" : "Create Promotion Event"}
                </h2>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event Name *
                  </label>
                  <input
                    type="text"
                    value={eventForm.name}
                    onChange={(e) => setEventForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Spring Belt Promotion"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Style *
                  </label>
                  <select
                    value={eventForm.styleId}
                    onChange={(e) => {
                      const style = styles.find(s => s.id === e.target.value);
                      setEventForm(prev => ({
                        ...prev,
                        styleId: e.target.value,
                        styleName: style?.name || "",
                      }));
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select a style...</option>
                    {styles.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date *
                    </label>
                    <input
                      type="date"
                      value={eventForm.date}
                      onChange={(e) => setEventForm(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Time
                    </label>
                    <input
                      type="time"
                      value={eventForm.time}
                      onChange={(e) => setEventForm(prev => ({ ...prev, time: e.target.value }))}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={eventForm.location}
                      onChange={(e) => setEventForm(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="e.g., Main Training Hall"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cost
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={eventForm.cost}
                        onChange={(e) => setEventForm(prev => ({ ...prev, cost: e.target.value }))}
                        placeholder="0.00"
                        className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Optional fee to charge members</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={eventForm.notes}
                    onChange={(e) => setEventForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any additional notes about this event..."
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
                <button
                  onClick={() => setShowEventModal(false)}
                  disabled={savingEvent}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEvent}
                  disabled={savingEvent || !eventForm.name.trim() || !eventForm.styleId}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {savingEvent ? "Saving..." : editingEvent ? "Save Changes" : "Create Event"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Participants Modal */}
      {showAddParticipantsModal && selectedEvent && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowAddParticipantsModal(false)} />

            <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b bg-gray-50">
                <h2 className="text-lg font-bold">Add Participants</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Select eligible members for {selectedEvent.styleName} to add to this event.
                </p>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {(() => {
                  const eventEligible = getEligibleForEvent(selectedEvent, showModalIneligible);

                  // Group by next rank
                  const byNextRank: Record<string, EligibleMember[]> = {};
                  eventEligible.forEach(e => {
                    if (!byNextRank[e.nextRank.name]) {
                      byNextRank[e.nextRank.name] = [];
                    }
                    byNextRank[e.nextRank.name].push(e);
                  });

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        {eventEligible.length > 0 ? (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedParticipants.size === eventEligible.length && eventEligible.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const eligibleOnly = eventEligible.filter(el => el.classRequirements.length === 0 || el.classRequirements.every(r => r.met));
                                  setSelectedParticipants(new Set(eligibleOnly.map(getKey)));
                                } else {
                                  setSelectedParticipants(new Set());
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300 accent-primary focus:ring-primary"
                            />
                            <span className="text-sm font-medium">Select All</span>
                          </label>
                        ) : (
                          <div />
                        )}
                        <div className="flex items-center gap-3">
                          {selectedParticipants.size > 0 && (
                            <span className="text-sm text-gray-500">{selectedParticipants.size} selected</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowModalIneligible(!showModalIneligible)}
                            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors"
                          >
                            {showModalIneligible ? "Hide" : "Show"} Ineligible
                          </button>
                        </div>
                      </div>

                      {eventEligible.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <p className="font-medium">No eligible members available</p>
                          <p className="text-sm mt-1">All eligible members have already been added to this event.</p>
                        </div>
                      ) : (
                        <>

                      {Object.entries(byNextRank).map(([rankName, rankEligible]) => {
                        const styleConfig = rankEligible[0]?.styleConfig;
                        const nextBeltColor = getBeltColor(styleConfig, rankName);

                        return (
                          <div key={rankName} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="bg-gray-50/50 px-4 py-2 flex items-center gap-3 border-b border-gray-100">
                              <div
                                className="w-8 h-3 rounded border border-primary/30"
                                style={{ backgroundColor: "#c41111" }}
                              />
                              <span className="text-sm font-semibold text-gray-700">
                                Promoting to {rankName}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({rankEligible.length} member{rankEligible.length !== 1 ? "s" : ""})
                              </span>
                            </div>

                            <div className="divide-y divide-gray-50">
                              {rankEligible.map((eligible) => {
                                const key = getKey(eligible);
                                const isSelected = selectedParticipants.has(key);
                                const currentBeltColor = getBeltColor(styleConfig, eligible.currentRank?.name || "");
                                const isIneligible = eligible.classRequirements.length > 0 && !eligible.classRequirements.every((r) => r.met);

                                return (
                                  <div
                                    key={key}
                                    className={`px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-gray-50 ${isSelected ? "bg-primary/5" : ""}`}
                                    onClick={() => {
                                      setSelectedParticipants(prev => {
                                        const next = new Set(prev);
                                        if (next.has(key)) {
                                          next.delete(key);
                                        } else {
                                          next.add(key);
                                        }
                                        return next;
                                      });
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {}}
                                      className="w-4 h-4 rounded border-gray-300 accent-primary focus:ring-primary"
                                    />

                                    {eligible.member.photoUrl ? (
                                      <img
                                        src={eligible.member.photoUrl}
                                        alt=""
                                        className="w-10 h-10 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium">
                                        {eligible.member.firstName?.[0]}
                                        {eligible.member.lastName?.[0]}
                                      </div>
                                    )}

                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-gray-900">
                                        {eligible.member.firstName} {eligible.member.lastName}
                                      </div>
                                      <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <div className="flex items-center gap-1">
                                          <div
                                            className="w-2.5 h-2.5 rounded-full border border-gray-300"
                                            style={{ backgroundColor: currentBeltColor }}
                                          />
                                          <span className="text-xs">{eligible.currentRank?.name || "No rank"}</span>
                                        </div>
                                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                        <div className="flex items-center gap-1">
                                          <div
                                            className="w-2.5 h-2.5 rounded-full border border-gray-300"
                                            style={{ backgroundColor: nextBeltColor }}
                                          />
                                          <span className="text-xs font-medium text-gray-700">{eligible.nextRank.name}</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="text-right shrink-0">
                                      {eligible.classRequirements.length > 0 ? (
                                        <div className="text-xs font-medium text-green-600">
                                          {eligible.classRequirements.map((req, idx) => (
                                            <span key={idx} className={req.met ? "text-green-600" : "text-red-600"}>
                                              {idx > 0 && <span className="text-gray-400">{" "}-{" "}</span>}
                                              {req.label}: {req.attended}/{req.required}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="text-xs font-medium text-green-600">
                                          No requirements
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      </>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
                <button
                  onClick={() => {
                    const eventEligible = getEligibleForEvent(selectedEvent, showModalIneligible);
                    const toAdd = eventEligible.filter(e => selectedParticipants.has(getKey(e)));
                    addParticipantsToEvent(toAdd);
                  }}
                  disabled={selectedParticipants.size === 0}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  Add {selectedParticipants.size > 0 ? `${selectedParticipants.size} ` : ""}Participant{selectedParticipants.size !== 1 ? "s" : ""}
                </button>
                <button
                  onClick={() => setShowAddParticipantsModal(false)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
