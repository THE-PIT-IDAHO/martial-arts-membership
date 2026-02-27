"use client";

import React, { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import Link from "next/link";
import { jsPDF } from "jspdf";
import { getTodayString } from "@/lib/dates";
import { RichTextInput, parseHtmlForPdf } from "@/components/rich-text-input";

type Style = {
  id: string;
  name: string;
  beltConfig?: string | null;
  ranks?: Rank[];
  testNamingConvention?: string; // "INTO_RANK" or "FROM_RANK"
};

type Rank = {
  id: string;
  name: string;
  order: number;
  classRequirement?: number | null;
};

type MemberStyle = {
  name: string;
  rank?: string;
  startDate?: string;
  lastPromotionDate?: string;
  active?: boolean;
};

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  stylesNotes?: string | null;
  status: string;
};

type TestingParticipant = {
  id: string;
  memberId: string;
  memberName: string;
  currentRank?: string | null;
  testingForRank?: string | null;
  status: string;
  score?: number | null;
  notes?: string | null;
  adminNotes?: string | null;
  resultPdfUrl?: string | null;
  itemScores?: string | null;
};

type RankTestItem = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  required: boolean;
  sortOrder: number;
  reps?: number | null;
  sets?: number | null;
  duration?: string | null;
  distance?: string | null;
  timeLimit?: string | null;
  timeLimitOperator?: string | null;
};

type RankTestCategory = {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  items: RankTestItem[];
};

type RankTest = {
  id: string;
  name: string;
  description?: string | null;
  categories: RankTestCategory[];
};

type ItemScore = {
  passed: boolean;
  failed?: boolean; // true = explicitly failed, false/undefined = not failed
  score?: number;
  notes?: string;
};

type ItemScores = Record<string, ItemScore>;

type TestingEvent = {
  id: string;
  name: string;
  date: string;
  time?: string | null;
  styleId: string;
  styleName: string;
  location?: string | null;
  notes?: string | null;
  status: string;
  participants: TestingParticipant[];
};

type SelectedMemberForTest = {
  member: Member;
  currentRank: string;
  testingForRank: string;
};

type GymSettings = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

export default function TestingPage() {
  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upcoming" | "schedule" | "results">("upcoming");

  // Testing events
  const [events, setEvents] = useState<TestingEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<TestingEvent | null>(null);

  // For scheduling/editing a test
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TestingEvent | null>(null);
  const [testName, setTestName] = useState("");
  const [testDate, setTestDate] = useState(getTodayString());
  const [testTime, setTestTime] = useState("10:00");
  const [testLocation, setTestLocation] = useState("");
  const [testNotes, setTestNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // For adding members to a test
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMembersForTest, setSelectedMembersForTest] = useState<SelectedMemberForTest[]>([]);

  // For viewing/editing a participant
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<TestingParticipant | null>(null);
  const [participantStatus, setParticipantStatus] = useState("");
  const [participantScore, setParticipantScore] = useState("");
  const [participantNotes, setParticipantNotes] = useState("");
  const [participantTestingForRank, setParticipantTestingForRank] = useState("");
  const [participantPdfUrl, setParticipantPdfUrl] = useState("");
  const [uploadingPdf, setUploadingPdf] = useState(false);

  // For grading sheet modal
  const [showGradingSheet, setShowGradingSheet] = useState(false);
  const [gradingParticipant, setGradingParticipant] = useState<TestingParticipant | null>(null);
  const [rankTestCurriculum, setRankTestCurriculum] = useState<RankTest | null>(null);
  const [itemScores, setItemScores] = useState<ItemScores>({});
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [savingGrades, setSavingGrades] = useState(false);
  // Manual status override: null = auto-calculate, "PASSED" or "FAILED" = manual
  const [manualStatus, setManualStatus] = useState<"PASSED" | "FAILED" | null>(null);
  // Individual grading notes
  const [individualNotes, setIndividualNotes] = useState("");
  const [individualAdminNotes, setIndividualAdminNotes] = useState("");

  // For bulk grading spreadsheet modal
  const [showBulkGrading, setShowBulkGrading] = useState(false);
  const [bulkGradingCurriculum, setBulkGradingCurriculum] = useState<RankTest | null>(null);
  const [loadingBulkCurriculum, setLoadingBulkCurriculum] = useState(false);
  const [savingBulkGrades, setSavingBulkGrades] = useState(false);
  // Maps participantId -> itemId -> ItemScore
  const [bulkItemScores, setBulkItemScores] = useState<Record<string, ItemScores>>({});
  // Maps participantId -> notes string (included in PDF)
  const [bulkParticipantNotes, setBulkParticipantNotes] = useState<Record<string, string>>({});
  // Maps participantId -> admin notes string (NOT included in PDF)
  const [bulkAdminNotes, setBulkAdminNotes] = useState<Record<string, string>>({});
  // Maps participantId -> manual status override
  const [bulkManualStatus, setBulkManualStatus] = useState<Record<string, "PASSED" | "FAILED" | null>>({});
  // Tracks selected participants for bulk pass/fail
  const [bulkSelectedForStatus, setBulkSelectedForStatus] = useState<Set<string>>(new Set());
  // For mobile view - track selected participant
  const [mobileSelectedParticipant, setMobileSelectedParticipant] = useState<string>("");

  // For displaying curriculum inline with participants
  const [curriculaByRank, setCurriculaByRank] = useState<Record<string, RankTest | null>>({});
  const [expandedParticipants, setExpandedParticipants] = useState<Set<string>>(new Set());
  const [loadingCurriculaForEvent, setLoadingCurriculaForEvent] = useState(false);

  // Gym settings for PDF generation
  const [gymSettings, setGymSettings] = useState<GymSettings>({ name: "Martial Arts School", address: "", phone: "", email: "" });
  const [gymLogoImg, setGymLogoImg] = useState<HTMLImageElement | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // PDF Viewer modal
  const [viewingPdfUrl, setViewingPdfUrl] = useState<string | null>(null);
  const [viewingPdfTitle, setViewingPdfTitle] = useState<string>("");

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/testing");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error("Error loading events:", err);
    }
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const stylesRes = await fetch("/api/styles");
        if (stylesRes.ok) {
          const stylesData = await stylesRes.json();
          setStyles(stylesData.styles || []);
          if (stylesData.styles?.length > 0) {
            setSelectedStyleId(stylesData.styles[0].id);
          }
        }

        // Load gym settings and logo for PDF generation
        const [gymRes, allSettingsRes] = await Promise.all([
          fetch("/api/settings?key=gym_settings"),
          fetch("/api/settings"),
        ]);
        if (gymRes.ok) {
          const gymData = await gymRes.json();
          if (gymData.setting?.value) {
            try {
              const parsed = JSON.parse(gymData.setting.value);
              setGymSettings(parsed);
            } catch {
              // Use defaults if parsing fails
            }
          }
        }
        if (allSettingsRes.ok) {
          const allData = await allSettingsRes.json();
          if (allData.settings && Array.isArray(allData.settings)) {
            const logoSetting = allData.settings.find((s: { key: string; value: string }) => s.key === "gymLogo");
            if (logoSetting?.value) {
              const img = new Image();
              img.onload = () => setGymLogoImg(img);
              img.src = logoSetting.value;
            }
          }
        }

        await loadEvents();
      } catch (err) {
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [loadEvents]);

  const selectedStyle = styles.find(s => s.id === selectedStyleId);

  // Load curricula for all unique testing ranks when an event is selected
  const loadCurriculaForEvent = useCallback(async (event: TestingEvent) => {
    if (!event || event.participants.length === 0) {
      setCurriculaByRank({});
      return;
    }

    // Find style with ranks
    const style = styles.find(s => s.id === event.styleId);
    if (!style?.ranks) {
      setCurriculaByRank({});
      return;
    }

    const namingConvention = style?.testNamingConvention || "INTO_RANK";

    // Get unique ranks to lookup based on naming convention
    // For FROM_RANK: use currentRank (what that rank needs to demonstrate)
    // For INTO_RANK: use testingForRank (what you need to achieve that rank)
    const uniqueRanks = namingConvention === "FROM_RANK"
      ? [...new Set(event.participants.map(p => p.currentRank).filter(Boolean))] as string[]
      : [...new Set(event.participants.map(p => p.testingForRank).filter(Boolean))] as string[];

    if (uniqueRanks.length === 0) {
      setCurriculaByRank({});
      return;
    }

    setLoadingCurriculaForEvent(true);
    const newCurricula: Record<string, RankTest | null> = {};

    try {
      // Load curriculum for each unique rank
      await Promise.all(
        uniqueRanks.map(async (rankName) => {
          // Try exact match first, then case-insensitive match
          let rank = style.ranks?.find(r => r.name === rankName);
          if (!rank) {
            rank = style.ranks?.find(r => r.name.toLowerCase().trim() === rankName.toLowerCase().trim());
          }
          if (!rank) {
            newCurricula[rankName] = null;
            return;
          }

          try {
            const res = await fetch(`/api/rank-tests?rankId=${rank.id}&styleId=${event.styleId}`);
            if (res.ok) {
              const data = await res.json();
              newCurricula[rankName] = data.rankTests?.[0] || null;
            } else {
              newCurricula[rankName] = null;
            }
          } catch {
            newCurricula[rankName] = null;
          }
        })
      );

      setCurriculaByRank(newCurricula);
    } catch (err) {
      console.error("Error loading curricula:", err);
    } finally {
      setLoadingCurriculaForEvent(false);
    }
  }, [styles]);

  // Load curricula when selected event changes
  useEffect(() => {
    if (selectedEvent) {
      loadCurriculaForEvent(selectedEvent);
    } else {
      setCurriculaByRank({});
      setExpandedParticipants(new Set());
    }
  }, [selectedEvent, loadCurriculaForEvent]);

  const toggleParticipantExpanded = (participantId: string) => {
    setExpandedParticipants(prev => {
      const newSet = new Set(prev);
      if (newSet.has(participantId)) {
        newSet.delete(participantId);
      } else {
        newSet.add(participantId);
      }
      return newSet;
    });
  };

  const upcomingEvents = events.filter(e =>
    e.status === "SCHEDULED" && new Date(e.date) >= new Date(new Date().setHours(0, 0, 0, 0))
  );
  const pastEvents = events.filter(e =>
    e.status === "COMPLETED" || new Date(e.date) < new Date(new Date().setHours(0, 0, 0, 0))
  );

  const openEditEventModal = (event: TestingEvent) => {
    setEditingEvent(event);
    setTestName(event.name);
    setTestDate(event.date.split("T")[0]);
    setTestTime(event.time || "10:00");
    setTestLocation(event.location || "");
    setTestNotes(event.notes || "");
    setSelectedStyleId(event.styleId);
    setShowScheduleModal(true);
  };

  const closeScheduleModal = () => {
    setShowScheduleModal(false);
    setEditingEvent(null);
    setTestName("");
    setTestDate("");
    setTestTime("10:00");
    setTestLocation("");
    setTestNotes("");
  };

  const handleScheduleTest = async () => {
    if (!testName || !testDate || !selectedStyleId) {
      alert("Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      const isEditing = !!editingEvent;
      const url = isEditing ? `/api/testing/${editingEvent.id}` : "/api/testing";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: testName,
          date: testDate,
          time: testTime,
          styleId: selectedStyleId,
          styleName: selectedStyle?.name || "",
          location: testLocation,
          notes: testNotes,
        }),
      });

      if (res.ok) {
        closeScheduleModal();
        await loadEvents();
      } else {
        alert(isEditing ? "Failed to update test" : "Failed to schedule test");
      }
    } catch (err) {
      console.error("Error saving test:", err);
      alert("Error saving test");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Are you sure you want to delete this testing event?")) return;

    try {
      const res = await fetch(`/api/testing/${eventId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadEvents();
        if (selectedEvent?.id === eventId) {
          setSelectedEvent(null);
        }
      }
    } catch (err) {
      console.error("Error deleting event:", err);
    }
  };

  const handleDuplicateEvent = async (event: TestingEvent) => {
    const newName = prompt("Enter name for the duplicated test:", `${event.name} (Copy)`);
    if (!newName) return;

    try {
      // Create the new event
      const res = await fetch("/api/testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          date: getTodayString(),
          time: event.time,
          styleId: event.styleId,
          styleName: event.styleName,
          location: event.location,
          notes: event.notes,
        }),
      });

      if (!res.ok) throw new Error("Failed to create event");
      const data = await res.json();
      const newEventId = data.event.id;

      // Add all participants from the original event
      for (const participant of event.participants) {
        await fetch(`/api/testing/${newEventId}/participants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: participant.memberId,
            memberName: participant.memberName,
            currentRank: participant.currentRank,
            testingForRank: participant.testingForRank,
          }),
        });
      }

      await loadEvents();
      alert(`Test duplicated successfully with ${event.participants.length} participant(s)`);
    } catch (err) {
      console.error("Error duplicating event:", err);
      alert("Failed to duplicate test. Please try again.");
    }
  };

  const handleCompleteEvent = async (eventId: string) => {
    try {
      const res = await fetch(`/api/testing/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });

      if (res.ok) {
        await loadEvents();
      }
    } catch (err) {
      console.error("Error completing event:", err);
    }
  };

  const handleReopenEvent = async (eventId: string) => {
    try {
      const res = await fetch(`/api/testing/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SCHEDULED" }),
      });

      if (res.ok) {
        await loadEvents();
        // Refresh selected event and switch to upcoming tab
        const eventRes = await fetch(`/api/testing/${eventId}`);
        if (eventRes.ok) {
          const eventData = await eventRes.json();
          setSelectedEvent(eventData.event);
          setActiveTab("upcoming");
        }
      }
    } catch (err) {
      console.error("Error reopening event:", err);
    }
  };

  const [styleMembers, setStyleMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const loadStyleMembers = async (styleName: string, styleId: string) => {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/members?styleName=${encodeURIComponent(styleName)}&styleId=${encodeURIComponent(styleId)}`);
      if (res.ok) {
        const data = await res.json();
        setStyleMembers(data.members || []);
        setMembers(data.members || []);
      }
    } catch (err) {
      console.error("Error loading style members:", err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadMembers = async (query: string) => {
    // Filter from styleMembers if we have them loaded
    if (styleMembers.length > 0) {
      if (!query.trim()) {
        setMembers(styleMembers);
        return;
      }
      const lowerQuery = query.toLowerCase();
      const filtered = styleMembers.filter(m =>
        m.firstName.toLowerCase().includes(lowerQuery) ||
        m.lastName.toLowerCase().includes(lowerQuery) ||
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(lowerQuery)
      );
      setMembers(filtered);
      return;
    }

    // Fallback to API search if no style members loaded
    if (!query.trim()) {
      setMembers([]);
      return;
    }

    try {
      const res = await fetch(`/api/members?search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch (err) {
      console.error("Error loading members:", err);
    }
  };

  const handleAddMembers = async () => {
    if (!selectedEvent || selectedMembersForTest.length === 0) return;

    setSaving(true);
    try {
      // Add each selected member
      const results = await Promise.all(
        selectedMembersForTest.map(async (selected) => {
          const res = await fetch(`/api/testing/${selectedEvent.id}/participants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              memberId: selected.member.id,
              memberName: `${selected.member.firstName} ${selected.member.lastName}`,
              currentRank: selected.currentRank,
              testingForRank: selected.testingForRank,
            }),
          });
          return { member: selected.member, ok: res.ok };
        })
      );

      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        alert(`Failed to add ${failed.length} member(s): ${failed.map(f => `${f.member.firstName} ${f.member.lastName}`).join(", ")}`);
      }

      setShowAddMemberModal(false);
      setSelectedMembersForTest([]);
      setSearchQuery("");
      setMembers([]);
      setStyleMembers([]);
      await loadEvents();

      // Refresh selected event
      const eventRes = await fetch(`/api/testing/${selectedEvent.id}`);
      if (eventRes.ok) {
        const eventData = await eventRes.json();
        setSelectedEvent(eventData.event);
      }
    } catch (err) {
      console.error("Error adding members:", err);
    } finally {
      setSaving(false);
    }
  };

  const toggleMemberSelection = (member: Member, currentRank: string, testingForRank: string) => {
    setSelectedMembersForTest(prev => {
      const existing = prev.find(s => s.member.id === member.id);
      if (existing) {
        // Remove from selection
        return prev.filter(s => s.member.id !== member.id);
      } else {
        // Add to selection
        return [...prev, { member, currentRank, testingForRank }];
      }
    });
  };

  const handleRemoveParticipant = async (participantId: string) => {
    if (!selectedEvent) return;
    if (!confirm("Remove this participant from the test?")) return;

    try {
      const res = await fetch(`/api/testing/${selectedEvent.id}/participants?participantId=${participantId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        // Refresh event
        const eventRes = await fetch(`/api/testing/${selectedEvent.id}`);
        if (eventRes.ok) {
          const eventData = await eventRes.json();
          setSelectedEvent(eventData.event);
        }
        await loadEvents();
      }
    } catch (err) {
      console.error("Error removing participant:", err);
    }
  };

  const handleUpdateParticipant = async () => {
    if (!selectedEvent || !editingParticipant) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/testing/${selectedEvent.id}/participants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: editingParticipant.id,
          status: participantStatus,
          score: participantScore ? parseInt(participantScore) : null,
          notes: participantNotes,
          testingForRank: participantTestingForRank || null,
        }),
      });

      if (res.ok) {
        setShowParticipantModal(false);
        setEditingParticipant(null);
        // Refresh event
        const eventRes = await fetch(`/api/testing/${selectedEvent.id}`);
        if (eventRes.ok) {
          const eventData = await eventRes.json();
          setSelectedEvent(eventData.event);
        }
        await loadEvents();
      }
    } catch (err) {
      console.error("Error updating participant:", err);
    } finally {
      setSaving(false);
    }
  };

  const openParticipantModal = (participant: TestingParticipant) => {
    setEditingParticipant(participant);
    setParticipantStatus(participant.status);
    setParticipantScore(participant.score?.toString() || "");
    setParticipantNotes(participant.notes || "");
    setParticipantTestingForRank(participant.testingForRank || "");
    setParticipantPdfUrl(participant.resultPdfUrl || "");
    setShowParticipantModal(true);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingParticipant) return;

    if (file.type !== "application/pdf") {
      alert("Only PDF files are allowed");
      return;
    }

    setUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append("files", file);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (uploadRes.ok) {
        const data = await uploadRes.json();
        if (data.files && data.files.length > 0) {
          const uploadedUrl = data.files[0].url;
          setParticipantPdfUrl(uploadedUrl);

          // Also save to participant immediately
          if (selectedEvent) {
            await fetch(`/api/testing/${selectedEvent.id}/participants`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                participantId: editingParticipant.id,
                resultPdfUrl: uploadedUrl,
              }),
            });

            // Also add to member's styleDocuments
            await addPdfToMemberDocuments(
              editingParticipant.memberId,
              uploadedUrl,
              `${selectedEvent.name} - ${editingParticipant.testingForRank || "Test"} Results`
            );
          }
        }
      }
    } catch (err) {
      console.error("Error uploading PDF:", err);
      alert("Failed to upload PDF");
    } finally {
      setUploadingPdf(false);
    }
  };

  const addPdfToMemberDocuments = async (memberId: string, pdfUrl: string, docName: string) => {
    try {
      // Fetch current member data
      const memberRes = await fetch(`/api/members/${memberId}`);
      if (!memberRes.ok) return;

      const memberData = await memberRes.json();
      const member = memberData.member;

      // Parse existing documents
      let docs: Array<{ id: string; name: string; url: string; uploadedAt: string }> = [];
      if (member.styleDocuments) {
        try {
          docs = JSON.parse(member.styleDocuments);
        } catch {}
      }

      // Check if a document with the same name already exists (same test result)
      const existingIndex = docs.findIndex(d => d.name === docName);

      const newDoc = {
        id: existingIndex >= 0 ? docs[existingIndex].id : `test-result-${Date.now()}`,
        name: docName,
        url: pdfUrl,
        uploadedAt: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        // Replace existing document
        docs[existingIndex] = newDoc;
      } else {
        // Add new document
        docs.push(newDoc);
      }

      // Save back to member
      await fetch(`/api/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          styleDocuments: JSON.stringify(docs),
        }),
      });
    } catch (err) {
      console.error("Error adding PDF to member documents:", err);
    }
  };

  // Generate test result PDF
  const generateTestResultPdf = (
    participant: TestingParticipant,
    event: TestingEvent,
    curriculum: RankTest,
    scores: ItemScores,
    overallScore: number,
    passed: boolean
  ): Blob => {
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
    yPos += 8;
    pdf.setFontSize(14);
    pdf.text("TEST RESULTS", pageWidth / 2, yPos, { align: "center" });
    yPos += 15;

    // Participant Info
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text("Participant:", margin, yPos);
    pdf.setFont("helvetica", "normal");
    pdf.text(participant.memberName, margin + 30, yPos);
    yPos += 6;

    pdf.setFont("helvetica", "bold");
    pdf.text("Current Rank:", margin, yPos);
    pdf.setFont("helvetica", "normal");
    pdf.text(participant.currentRank || "N/A", margin + 35, yPos);

    pdf.setFont("helvetica", "bold");
    pdf.text("Testing For:", pageWidth / 2, yPos);
    pdf.setFont("helvetica", "normal");
    pdf.text(participant.testingForRank || "N/A", pageWidth / 2 + 28, yPos);
    yPos += 10;

    // Event Info
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("Test Event:", margin, yPos);
    pdf.setFont("helvetica", "normal");
    pdf.text(event.name, margin + 28, yPos);
    yPos += 5;

    pdf.setFont("helvetica", "bold");
    pdf.text("Date:", margin, yPos);
    pdf.setFont("helvetica", "normal");
    pdf.text(new Date(event.date).toLocaleDateString(), margin + 15, yPos);

    if (event.location) {
      pdf.setFont("helvetica", "bold");
      pdf.text("Location:", pageWidth / 2, yPos);
      pdf.setFont("helvetica", "normal");
      pdf.text(event.location, pageWidth / 2 + 22, yPos);
    }
    yPos += 5;

    pdf.setFont("helvetica", "bold");
    pdf.text("Style:", margin, yPos);
    pdf.setFont("helvetica", "normal");
    pdf.text(event.styleName, margin + 15, yPos);
    yPos += 10;

    // Horizontal line
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    // Curriculum breakdown
    for (const category of curriculum.categories) {
      // Check for page break
      if (yPos > 260) {
        pdf.addPage();
        yPos = 20;
      }

      // Category header
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.setFillColor(240, 240, 240);
      pdf.rect(margin, yPos - 4, maxWidth, 7, "F");
      pdf.text(category.name.toUpperCase(), margin + 2, yPos);
      yPos += 8;

      // Items
      pdf.setFontSize(9);
      for (const item of category.items) {
        if (yPos > 270) {
          pdf.addPage();
          yPos = 20;
        }

        const score = scores[item.id];
        const isPassed = score?.passed ?? false;
        const isFailed = score?.failed ?? false;

        // Status indicator
        let statusSymbol = "[ ]"; // incomplete
        let statusText = "INCOMPLETE";
        if (isPassed) {
          statusSymbol = "[X]";
          statusText = "PASSED";
        } else if (isFailed) {
          statusSymbol = "[X]";
          statusText = "FAILED";
        }

        // Draw status
        pdf.setFont("helvetica", "bold");
        if (isPassed) {
          pdf.setTextColor(0, 128, 0); // green
        } else if (isFailed) {
          pdf.setTextColor(200, 0, 0); // red
        } else {
          pdf.setTextColor(128, 128, 128); // gray
        }
        pdf.text(statusSymbol, margin, yPos);

        // Item name
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "normal");
        const itemText = item.name;
        pdf.text(itemText, margin + 12, yPos);

        // Time/notes if present
        if (score?.notes) {
          pdf.setTextColor(100, 100, 100);
          const noteText = item.timeLimit ? `(${score.notes})` : `- ${score.notes}`;
          pdf.text(noteText, margin + 12 + pdf.getTextWidth(itemText) + 2, yPos);
          pdf.setTextColor(0, 0, 0);
        }

        // Status text on right
        pdf.setFont("helvetica", "italic");
        if (isPassed) {
          pdf.setTextColor(0, 128, 0);
        } else if (isFailed) {
          pdf.setTextColor(200, 0, 0);
        } else {
          pdf.setTextColor(128, 128, 128);
        }
        pdf.text(statusText, pageWidth - margin, yPos, { align: "right" });
        pdf.setTextColor(0, 0, 0);

        yPos += 5;
      }
      yPos += 3;
    }

    // Final result section
    if (yPos > 240) {
      pdf.addPage();
      yPos = 20;
    }
    yPos += 5;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    // Overall result
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("OVERALL RESULT:", margin, yPos);
    if (passed) {
      pdf.setTextColor(0, 128, 0);
      pdf.text("PASSED", margin + 50, yPos);
    } else {
      pdf.setTextColor(200, 0, 0);
      pdf.text("FAILED", margin + 50, yPos);
    }
    pdf.setTextColor(0, 0, 0);
    yPos += 8;

    // Score
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    const totalItems = curriculum.categories.reduce((sum, cat) => sum + cat.items.length, 0);
    const passedItems = Object.values(scores).filter(s => s?.passed).length;
    pdf.text(`Score: ${overallScore}% (${passedItems}/${totalItems} items)`, margin, yPos);
    yPos += 10;

    // Notes (if present) - supports bold formatting from HTML
    if (participant.notes) {
      if (yPos > 250) {
        pdf.addPage();
        yPos = 20;
      }
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.text("Notes:", margin, yPos);
      yPos += 5;
      pdf.setTextColor(60, 60, 60);

      // Parse HTML content for bold formatting
      const segments = parseHtmlForPdf(participant.notes);
      let currentX = margin;
      const lineHeight = 4;

      for (const segment of segments) {
        // Handle newlines
        const lines = segment.text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            // New line
            yPos += lineHeight;
            currentX = margin;
            if (yPos > 270) {
              pdf.addPage();
              yPos = 20;
            }
          }

          const text = lines[i];
          if (!text) continue;

          // Set font based on bold state
          pdf.setFont("helvetica", segment.bold ? "bold" : "normal");

          // Word wrap if needed
          const words = text.split(" ");
          for (let j = 0; j < words.length; j++) {
            const word = words[j];
            const wordWidth = pdf.getTextWidth(word + (j < words.length - 1 ? " " : ""));

            if (currentX + wordWidth > pageWidth - margin && currentX > margin) {
              yPos += lineHeight;
              currentX = margin;
              if (yPos > 270) {
                pdf.addPage();
                yPos = 20;
              }
            }

            pdf.text(word, currentX, yPos);
            currentX += wordWidth;
          }
        }
      }

      yPos += lineHeight + 5;
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "normal");
    }

    // Timestamp
    pdf.setFontSize(8);
    pdf.setTextColor(128, 128, 128);
    pdf.text(`Graded on: ${new Date().toLocaleString()}`, margin, yPos);

    // Return as blob
    return pdf.output("blob");
  };

  // Upload PDF and save to participant/member
  const uploadAndSavePdf = async (
    pdfBlob: Blob,
    participant: TestingParticipant,
    event: TestingEvent
  ): Promise<string | null> => {
    try {
      // Create form data with the PDF
      const formData = new FormData();
      const fileName = `${participant.memberName.replace(/\s+/g, "_")}_${event.name.replace(/\s+/g, "_")}_Results.pdf`;
      formData.append("files", pdfBlob, fileName);

      // Upload
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        console.error("Failed to upload PDF");
        return null;
      }

      const uploadData = await uploadRes.json();
      if (!uploadData.files || uploadData.files.length === 0) {
        return null;
      }

      const pdfUrl = uploadData.files[0].url;

      // Save to participant record
      await fetch(`/api/testing/${event.id}/participants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: participant.id,
          resultPdfUrl: pdfUrl,
        }),
      });

      // Add to member's documents
      await addPdfToMemberDocuments(
        participant.memberId,
        pdfUrl,
        `${event.name} - ${participant.testingForRank || "Test"} Results`
      );

      return pdfUrl;
    } catch (err) {
      console.error("Error uploading PDF:", err);
      return null;
    }
  };

  // Grading sheet functions
  const openGradingSheet = async (participant: TestingParticipant) => {
    setGradingParticipant(participant);
    setShowGradingSheet(true);
    setLoadingCurriculum(true);

    // Load existing item scores if any
    if (participant.itemScores) {
      try {
        setItemScores(JSON.parse(participant.itemScores));
      } catch {
        setItemScores({});
      }
    } else {
      setItemScores({});
    }

    // Load existing manual status if participant was already graded
    if (participant.status === "PASSED" || participant.status === "FAILED") {
      setManualStatus(participant.status as "PASSED" | "FAILED");
    } else {
      setManualStatus(null);
    }

    // Load existing notes
    setIndividualNotes(participant.notes || "");
    setIndividualAdminNotes(participant.adminNotes || "");

    // Find the rank to load curriculum for
    // For FROM_RANK convention: curriculum is associated with current rank (what that rank needs to demonstrate)
    // For INTO_RANK convention: curriculum is associated with target rank (what you need to achieve that rank)
    const style = styles.find(s => s.id === selectedEvent?.styleId);
    const namingConvention = style?.testNamingConvention || "INTO_RANK";

    console.log("[Curriculum Debug] Style naming convention:", {
      styleName: style?.name,
      testNamingConvention: style?.testNamingConvention,
      usingConvention: namingConvention,
    });

    // Determine which rank to use for curriculum lookup
    const rankToLookup = namingConvention === "FROM_RANK"
      ? participant.currentRank  // Use current rank for FROM_RANK convention
      : participant.testingForRank;  // Use target rank for INTO_RANK convention

    if (!rankToLookup || !selectedEvent) {
      console.log("[Curriculum Debug] No rank to lookup or selectedEvent", {
        rankToLookup,
        namingConvention,
        currentRank: participant.currentRank,
        testingForRank: participant.testingForRank,
        selectedEvent: !!selectedEvent
      });
      setLoadingCurriculum(false);
      return;
    }

    console.log("[Curriculum Debug] Looking for rank:", {
      namingConvention,
      rankToLookup,
      currentRank: participant.currentRank,
      testingForRank: participant.testingForRank,
      styleId: selectedEvent.styleId,
      styleName: style?.name,
      availableRanks: style?.ranks?.map(r => ({ id: r.id, name: r.name })),
    });

    // Try exact match first, then case-insensitive match
    let rank = style?.ranks?.find(r => r.name === rankToLookup);
    if (!rank) {
      // Try case-insensitive match
      rank = style?.ranks?.find(r => r.name.toLowerCase().trim() === rankToLookup.toLowerCase().trim());
      if (rank) {
        console.log("[Curriculum Debug] Found rank via case-insensitive match:", rank.name);
      }
    }

    if (!rank) {
      console.log("[Curriculum Debug] Rank NOT found by name match. rankToLookup:", rankToLookup);
      setLoadingCurriculum(false);
      return;
    }

    console.log("[Curriculum Debug] Found rank:", { rankId: rank.id, rankName: rank.name });

    try {
      const res = await fetch(`/api/rank-tests?rankId=${rank.id}&styleId=${selectedEvent.styleId}`);
      if (res.ok) {
        const data = await res.json();
        console.log("[Curriculum Debug] API response:", { rankTests: data.rankTests?.length || 0, data });
        if (data.rankTests && data.rankTests.length > 0) {
          setRankTestCurriculum(data.rankTests[0]);
        } else {
          setRankTestCurriculum(null);
        }
      }
    } catch (err) {
      console.error("Error loading curriculum:", err);
    } finally {
      setLoadingCurriculum(false);
    }
  };

  const closeGradingSheet = () => {
    setShowGradingSheet(false);
    setGradingParticipant(null);
    setRankTestCurriculum(null);
    setItemScores({});
    setManualStatus(null);
    setIndividualNotes("");
    setIndividualAdminNotes("");
  };

  // Cycle through: incomplete → pass → fail → incomplete
  const toggleItemPassed = (itemId: string) => {
    setItemScores(prev => {
      const current = prev[itemId];
      const isPassed = current?.passed ?? false;
      const isFailed = current?.failed ?? false;

      let newPassed = false;
      let newFailed = false;

      if (!isPassed && !isFailed) {
        // incomplete → pass
        newPassed = true;
        newFailed = false;
      } else if (isPassed && !isFailed) {
        // pass → fail
        newPassed = false;
        newFailed = true;
      } else {
        // fail → incomplete
        newPassed = false;
        newFailed = false;
      }

      return {
        ...prev,
        [itemId]: {
          ...current,
          passed: newPassed,
          failed: newFailed,
        },
      };
    });
  };

  const setItemNotes = (itemId: string, notes: string) => {
    setItemScores(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        passed: prev[itemId]?.passed ?? false,
        notes,
      },
    }));
  };

  // Auto-format time input to MM:SS format
  const formatTimeInput = (value: string): string => {
    // Remove all non-numeric characters except colon
    const cleaned = value.replace(/[^\d]/g, '');

    if (cleaned.length === 0) return '';
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 4) {
      // Insert colon after first 1-2 digits for minutes
      const mins = cleaned.slice(0, -2);
      const secs = cleaned.slice(-2);
      return `${mins}:${secs}`;
    }
    // Max 4 digits (MM:SS)
    const trimmed = cleaned.slice(0, 4);
    const mins = trimmed.slice(0, -2);
    const secs = trimmed.slice(-2);
    return `${mins}:${secs}`;
  };

  const handleItemTimeInput = (itemId: string, value: string) => {
    const formatted = formatTimeInput(value);
    setItemNotes(itemId, formatted);
  };

  const saveGradingSheet = async () => {
    if (!selectedEvent || !gradingParticipant) return;

    setSavingGrades(true);
    try {
      // Calculate overall pass/fail based on required items
      let allRequiredPassed = true;
      let totalItems = 0;
      let passedItems = 0;

      if (rankTestCurriculum) {
        rankTestCurriculum.categories.forEach(category => {
          category.items.forEach(item => {
            totalItems++;
            const score = itemScores[item.id];
            if (score?.passed) {
              passedItems++;
            } else if (item.required) {
              allRequiredPassed = false;
            }
          });
        });
      }

      // Calculate percentage score
      const percentScore = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;

      // Use manual status if set, otherwise keep as INCOMPLETE
      const finalStatus = manualStatus || "INCOMPLETE";

      const res = await fetch(`/api/testing/${selectedEvent.id}/participants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: gradingParticipant.id,
          itemScores: JSON.stringify(itemScores),
          score: percentScore,
          status: finalStatus,
          notes: individualNotes || null,
          adminNotes: individualAdminNotes || null,
        }),
      });

      if (res.ok) {
        // Generate and upload PDF
        if (rankTestCurriculum) {
          setGeneratingPdf(true);
          try {
            const pdfBlob = generateTestResultPdf(
              gradingParticipant,
              selectedEvent,
              rankTestCurriculum,
              itemScores,
              percentScore,
              finalStatus === "PASSED"
            );
            await uploadAndSavePdf(pdfBlob, gradingParticipant, selectedEvent);
          } catch (pdfErr) {
            console.error("Error generating PDF:", pdfErr);
          } finally {
            setGeneratingPdf(false);
          }
        }

        // Refresh event data
        const eventRes = await fetch(`/api/testing/${selectedEvent.id}`);
        if (eventRes.ok) {
          const eventData = await eventRes.json();
          setSelectedEvent(eventData.event);
        }
        await loadEvents();
        closeGradingSheet();
      } else {
        alert("Failed to save grades");
      }
    } catch (err) {
      console.error("Error saving grades:", err);
      alert("Error saving grades");
    } finally {
      setSavingGrades(false);
    }
  };

  // Bulk grading functions
  const openBulkGrading = async () => {
    if (!selectedEvent || selectedEvent.participants.length === 0) return;

    setShowBulkGrading(true);
    setLoadingBulkCurriculum(true);
    // Initialize mobile view with first participant selected
    setMobileSelectedParticipant(selectedEvent.participants[0]?.id || "");

    // Initialize bulk scores, notes, admin notes, and manual status from existing participant data
    const initialScores: Record<string, ItemScores> = {};
    const initialNotes: Record<string, string> = {};
    const initialAdminNotes: Record<string, string> = {};
    const initialManualStatus: Record<string, "PASSED" | "FAILED" | null> = {};
    for (const p of selectedEvent.participants) {
      if (p.itemScores) {
        try {
          initialScores[p.id] = JSON.parse(p.itemScores);
        } catch {
          initialScores[p.id] = {};
        }
      } else {
        initialScores[p.id] = {};
      }
      initialNotes[p.id] = p.notes || "";
      initialAdminNotes[p.id] = p.adminNotes || "";
      // Load existing status if already graded
      if (p.status === "PASSED" || p.status === "FAILED") {
        initialManualStatus[p.id] = p.status as "PASSED" | "FAILED";
      } else {
        initialManualStatus[p.id] = null;
      }
    }
    setBulkItemScores(initialScores);
    setBulkParticipantNotes(initialNotes);
    setBulkAdminNotes(initialAdminNotes);
    setBulkManualStatus(initialManualStatus);

    // Load curriculum - we'll use the first participant's curriculum as a template
    // All participants testing for the same rank should share the same curriculum
    const style = styles.find(s => s.id === selectedEvent.styleId);
    const namingConvention = style?.testNamingConvention || "INTO_RANK";

    // Get the first valid rank to lookup
    const firstParticipant = selectedEvent.participants[0];
    const rankToLookup = namingConvention === "FROM_RANK"
      ? firstParticipant?.currentRank
      : firstParticipant?.testingForRank;

    if (!rankToLookup || !style?.ranks) {
      setLoadingBulkCurriculum(false);
      return;
    }

    // Find the rank
    let rank = style.ranks.find(r => r.name === rankToLookup);
    if (!rank) {
      rank = style.ranks.find(r => r.name.toLowerCase().trim() === rankToLookup.toLowerCase().trim());
    }

    if (!rank) {
      setLoadingBulkCurriculum(false);
      return;
    }

    try {
      const res = await fetch(`/api/rank-tests?rankId=${rank.id}&styleId=${selectedEvent.styleId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.rankTests && data.rankTests.length > 0) {
          setBulkGradingCurriculum(data.rankTests[0]);
        } else {
          setBulkGradingCurriculum(null);
        }
      }
    } catch (err) {
      console.error("Error loading bulk curriculum:", err);
    } finally {
      setLoadingBulkCurriculum(false);
    }
  };

  const closeBulkGrading = () => {
    setShowBulkGrading(false);
    setBulkGradingCurriculum(null);
    setBulkItemScores({});
    setMobileSelectedParticipant("");
    setBulkSelectedForStatus(new Set());
    setBulkManualStatus({});
    setBulkParticipantNotes({});
    setBulkAdminNotes({});
  };

  // Cycle through: incomplete → pass → fail → incomplete
  const toggleBulkItemPassed = (participantId: string, itemId: string) => {
    setBulkItemScores(prev => {
      const current = prev[participantId]?.[itemId];
      const isPassed = current?.passed ?? false;
      const isFailed = current?.failed ?? false;

      let newPassed = false;
      let newFailed = false;

      if (!isPassed && !isFailed) {
        // incomplete → pass
        newPassed = true;
        newFailed = false;
      } else if (isPassed && !isFailed) {
        // pass → fail
        newPassed = false;
        newFailed = true;
      } else {
        // fail → incomplete
        newPassed = false;
        newFailed = false;
      }

      return {
        ...prev,
        [participantId]: {
          ...prev[participantId],
          [itemId]: {
            ...current,
            passed: newPassed,
            failed: newFailed,
          },
        },
      };
    });
  };

  const setBulkItemValue = (participantId: string, itemId: string, value: string) => {
    setBulkItemScores(prev => ({
      ...prev,
      [participantId]: {
        ...prev[participantId],
        [itemId]: {
          ...prev[participantId]?.[itemId],
          passed: prev[participantId]?.[itemId]?.passed ?? false,
          notes: value,
        },
      },
    }));
  };

  const handleTimeInput = (participantId: string, itemId: string, value: string) => {
    const formatted = formatTimeInput(value);
    setBulkItemValue(participantId, itemId, formatted);
  };

  const saveBulkGrades = async () => {
    if (!selectedEvent || !bulkGradingCurriculum) return;

    setSavingBulkGrades(true);
    try {
      // Save grades for each participant and track results for PDF generation
      const results = await Promise.all(
        selectedEvent.participants.map(async (p) => {
          const participantScores = bulkItemScores[p.id] || {};

          // Calculate pass/fail based on required items
          let allRequiredPassed = true;
          let totalItems = 0;
          let passedItems = 0;

          bulkGradingCurriculum.categories.forEach(category => {
            category.items.forEach(item => {
              totalItems++;
              const score = participantScores[item.id];
              if (score?.passed) {
                passedItems++;
              } else if (item.required) {
                allRequiredPassed = false;
              }
            });
          });

          const percentScore = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;

          // Use manual status if set, otherwise keep as INCOMPLETE
          const finalStatus = bulkManualStatus[p.id] || "INCOMPLETE";

          const res = await fetch(`/api/testing/${selectedEvent.id}/participants`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              participantId: p.id,
              itemScores: JSON.stringify(participantScores),
              score: percentScore,
              status: finalStatus,
              notes: bulkParticipantNotes[p.id] || null,
              adminNotes: bulkAdminNotes[p.id] || null,
            }),
          });

          return {
            participant: p,
            ok: res.ok,
            scores: participantScores,
            percentScore,
            passed: finalStatus === "PASSED"
          };
        })
      );

      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        alert(`Failed to save grades for ${failed.length} participant(s)`);
      }

      // Generate PDFs for all successfully saved participants
      setGeneratingPdf(true);
      try {
        const successfulResults = results.filter(r => r.ok);
        await Promise.all(
          successfulResults.map(async (result) => {
            try {
              const pdfBlob = generateTestResultPdf(
                result.participant,
                selectedEvent,
                bulkGradingCurriculum,
                result.scores,
                result.percentScore,
                result.passed
              );
              await uploadAndSavePdf(pdfBlob, result.participant, selectedEvent);
            } catch (pdfErr) {
              console.error(`Error generating PDF for ${result.participant.memberName}:`, pdfErr);
            }
          })
        );
      } catch (pdfErr) {
        console.error("Error generating PDFs:", pdfErr);
      } finally {
        setGeneratingPdf(false);
      }

      // Refresh event data
      const eventRes = await fetch(`/api/testing/${selectedEvent.id}`);
      if (eventRes.ok) {
        const eventData = await eventRes.json();
        setSelectedEvent(eventData.event);
      }
      await loadEvents();
      closeBulkGrading();
    } catch (err) {
      console.error("Error saving bulk grades:", err);
      alert("Error saving grades");
    } finally {
      setSavingBulkGrades(false);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "skill": return "bg-blue-100 text-blue-800";
      case "form": return "bg-purple-100 text-purple-800";
      case "workout": return "bg-orange-100 text-orange-800";
      case "sparring": return "bg-red-100 text-red-800";
      case "self_defense": return "bg-green-100 text-green-800";
      case "breaking": return "bg-yellow-100 text-yellow-800";
      case "knowledge": return "bg-indigo-100 text-indigo-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      skill: "Skill",
      form: "Form",
      workout: "Workout",
      sparring: "Sparring",
      self_defense: "Self-Defense",
      breaking: "Breaking",
      knowledge: "Knowledge",
      other: "Other",
    };
    return labels[type] || type;
  };

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "PASSED": return "bg-green-100 text-green-800";
      case "FAILED": return "bg-red-100 text-red-800";
      case "NO_SHOW": return "bg-gray-100 text-gray-800";
      default: return "bg-blue-100 text-blue-800";
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Testing</h1>
          <div className="text-sm text-gray-600">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header with action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Testing</h1>
            <p className="text-sm text-gray-600">
              Schedule and manage rank testing events for members
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowScheduleModal(true)}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
            >
              Schedule Test
            </button>
          </div>
        </div>

        {/* Style Filter */}
        {styles.length > 1 && (
          <select
            value={selectedStyleId}
            onChange={(e) => setSelectedStyleId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {styles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-4">
            <button
              onClick={() => { setActiveTab("upcoming"); setSelectedEvent(null); }}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "upcoming"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Upcoming Tests ({upcomingEvents.length})
            </button>
            <button
              onClick={() => setActiveTab("schedule")}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "schedule"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Eligible Members
            </button>
            <button
              onClick={() => { setActiveTab("results"); setSelectedEvent(null); }}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "results"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Past Results ({pastEvents.length})
            </button>
          </nav>
        </div>

        {/* Content */}
        {activeTab === "upcoming" && (
          <div className="space-y-4">
            {selectedEvent ? (
              // Event detail view
              <div className="space-y-4">
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-sm text-primary hover:text-primaryDark flex items-center gap-1"
                >
                  ← Back to Events
                </button>

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold">{selectedEvent.name}</h2>
                      <p className="text-sm text-gray-600">
                        {formatDate(selectedEvent.date)}
                        {selectedEvent.time && ` at ${selectedEvent.time}`}
                        {selectedEvent.location && ` • ${selectedEvent.location}`}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Style: {selectedEvent.styleName}
                        {(() => {
                          const eventStyle = styles.find(s => s.id === selectedEvent.styleId);
                          if (eventStyle?.testNamingConvention) {
                            return (
                              <>
                                {" • "}
                                <span className="text-gray-400">
                                  {eventStyle.testNamingConvention === "FROM_RANK"
                                    ? "Testing FROM this rank level"
                                    : "Testing INTO this rank level"}
                                </span>
                              </>
                            );
                          }
                          return null;
                        })()}
                      </p>
                      {selectedEvent.notes && (
                        <p className="text-sm text-gray-500 mt-2" dangerouslySetInnerHTML={{ __html: selectedEvent.notes }} />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowAddMemberModal(true);
                          setSearchQuery("");
                          setSelectedMembersForTest([]);
                          // Set the style to match the testing event's style
                          if (selectedEvent?.styleId) {
                            setSelectedStyleId(selectedEvent.styleId);
                          }
                          // Load all members for this style who have proper membership
                          if (selectedEvent?.styleName && selectedEvent?.styleId) {
                            loadStyleMembers(selectedEvent.styleName, selectedEvent.styleId);
                          }
                        }}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                      >
                        Add Members
                      </button>
                      {selectedEvent.participants.length > 0 && (
                        <button
                          onClick={openBulkGrading}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          Bulk Grade
                        </button>
                      )}
                      <button
                        onClick={() => handleCompleteEvent(selectedEvent.id)}
                        className="rounded-md border border-green-500 px-3 py-1 text-xs font-semibold text-green-600 hover:bg-green-50"
                      >
                        Mark Complete
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-lg font-semibold mb-3">
                      Rank Tests ({(() => {
                        const ranks = [...new Set(selectedEvent.participants.map(p => p.testingForRank || "Unassigned"))];
                        return ranks.length;
                      })()} tests, {selectedEvent.participants.length} participants)
                    </h3>

                    {selectedEvent.participants.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-8">
                        No participants added yet. Click "Add Member" to register members for this test.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {(() => {
                          // Group participants by testingForRank
                          const groupedByRank: Record<string, typeof selectedEvent.participants> = {};
                          const eventStyle = styles.find(s => s.id === selectedEvent.styleId);
                          const styleRanks = eventStyle?.ranks || [];

                          selectedEvent.participants.forEach(p => {
                            const rank = p.testingForRank || "Unassigned";
                            if (!groupedByRank[rank]) {
                              groupedByRank[rank] = [];
                            }
                            groupedByRank[rank].push(p);
                          });

                          // Sort by rank order
                          const sortedRanks = Object.keys(groupedByRank).sort((a, b) => {
                            const aOrder = styleRanks.find(r => r.name === a)?.order ?? 999;
                            const bOrder = styleRanks.find(r => r.name === b)?.order ?? 999;
                            return aOrder - bOrder;
                          });

                          return sortedRanks.map(rankName => {
                            const participants = groupedByRank[rankName];
                            const passedCount = participants.filter(p => p.status === "PASSED").length;
                            const failedCount = participants.filter(p => p.status === "FAILED").length;
                            const pendingCount = participants.filter(p => p.status === "REGISTERED").length;
                            const rankConfig = styleRanks.find(r => r.name === rankName);

                            return (
                              <div key={rankName} className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <h4 className="font-semibold text-gray-900">
                                      {rankName} Test
                                    </h4>
                                    <span className="text-sm text-gray-500">
                                      ({participants.length} participant{participants.length !== 1 ? "s" : ""})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs">
                                    {passedCount > 0 && (
                                      <span className="text-green-600 font-medium">{passedCount} passed</span>
                                    )}
                                    {failedCount > 0 && (
                                      <span className="text-red-600 font-medium">{failedCount} failed</span>
                                    )}
                                    {pendingCount > 0 && (
                                      <span className="text-blue-600 font-medium">{pendingCount} pending</span>
                                    )}
                                  </div>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b bg-white">
                                        <th className="text-left py-2 px-2 w-8"></th>
                                        <th className="text-left py-2 px-2">Name</th>
                                        <th className="text-left py-2 px-2">Current Rank</th>
                                        <th className="text-left py-2 px-2">Status</th>
                                        <th className="text-left py-2 px-2">Score</th>
                                        <th className="text-left py-2 px-2">Results</th>
                                        <th className="text-right py-2 px-2">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {participants.map((p) => {
                              const isExpanded = expandedParticipants.has(p.id);
                              // Get naming convention from style
                              const eventStyle = styles.find(s => s.id === selectedEvent.styleId);
                              const namingConv = eventStyle?.testNamingConvention || "INTO_RANK";
                              // For FROM_RANK: curriculum is keyed by currentRank
                              // For INTO_RANK: curriculum is keyed by testingForRank
                              const curriculumKey = namingConv === "FROM_RANK" ? p.currentRank : p.testingForRank;
                              const curriculum = curriculumKey ? curriculaByRank[curriculumKey] : null;
                              const hasCurriculum = curriculum && curriculum.categories.length > 0;
                              const parsedItemScores: ItemScores = p.itemScores ? JSON.parse(p.itemScores) : {};

                              return (
                                <React.Fragment key={p.id}>
                                  <tr className="border-b hover:bg-gray-50">
                                    <td className="py-2 px-2">
                                      {hasCurriculum && (
                                        <button
                                          onClick={() => toggleParticipantExpanded(p.id)}
                                          className="p-1 text-gray-400 hover:text-gray-600"
                                          title={isExpanded ? "Hide curriculum" : "Show curriculum"}
                                        >
                                          <svg
                                            className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                          </svg>
                                        </button>
                                      )}
                                    </td>
                                    <td className="py-2 px-2 font-medium">
                                      <Link href={`/members/${p.memberId}`} className="text-primary hover:underline">
                                        {p.memberName}
                                      </Link>
                                    </td>
                                    <td className="py-2 px-2">
                                      <div className="flex items-center gap-1">
                                        {p.currentRank || "-"}
                                        {hasCurriculum && (
                                          <span className="text-xs text-green-600" title="Curriculum attached">
                                            ✓
                                          </span>
                                        )}
                                        {curriculumKey && !hasCurriculum && !loadingCurriculaForEvent && (
                                          <span className="text-xs text-orange-500" title={`No curriculum found for ${curriculumKey}`}>
                                            !
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2 px-2">
                                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(p.status)}`}>
                                        {p.status}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2">{p.score ?? "-"}</td>
                                    <td className="py-2 px-2">
                                      {p.resultPdfUrl ? (
                                        <button
                                          onClick={() => {
                                            setViewingPdfUrl(p.resultPdfUrl!);
                                            setViewingPdfTitle(`${p.memberName} - Test Results`);
                                          }}
                                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
                                          </svg>
                                          View PDF
                                        </button>
                                      ) : (
                                        <span className="text-gray-400 text-xs">-</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-2 text-right">
                                      <button
                                        onClick={() => openGradingSheet(p)}
                                        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark mr-2"
                                      >
                                        Grade
                                      </button>
                                      <button
                                        onClick={() => openParticipantModal(p)}
                                        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark mr-2"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => handleRemoveParticipant(p.id)}
                                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                  {/* Expandable curriculum section */}
                                  {isExpanded && curriculum && (
                                    <tr>
                                      <td colSpan={7} className="bg-gray-50 p-4">
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between">
                                            <h4 className="font-semibold text-sm">
                                              {curriculum.name} - Test Requirements
                                            </h4>
                                            <span className="text-xs text-gray-500">
                                              {curriculum.categories.reduce((sum, c) => sum + c.items.length, 0)} items total
                                            </span>
                                          </div>
                                          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                            {curriculum.categories.map((category) => (
                                              <div key={category.id} className="bg-white border rounded-lg p-3">
                                                <h5 className="font-medium text-sm mb-2">{category.name}</h5>
                                                <ul className="space-y-1">
                                                  {category.items.map((item) => {
                                                    const itemScore = parsedItemScores[item.id];
                                                    const isPassed = itemScore?.passed;
                                                    return (
                                                      <li
                                                        key={item.id}
                                                        className={`text-xs flex items-start gap-2 ${
                                                          isPassed ? "text-green-700" : "text-gray-600"
                                                        }`}
                                                      >
                                                        <span className={`flex-shrink-0 ${isPassed ? "text-green-500" : "text-gray-300"}`}>
                                                          {isPassed ? "✓" : "○"}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                          <span className={isPassed ? "line-through" : ""}>
                                                            {item.name}
                                                          </span>
                                                          {(item.reps || item.sets || item.duration || item.distance || item.timeLimit) && (
                                                            <span className="ml-1 text-gray-400 text-[10px]">
                                                              ({item.sets && `${item.sets}×`}{item.reps && `${item.reps}`}
                                                              {item.duration && ` ${item.duration}`}
                                                              {item.distance && ` ${item.distance}`}
                                                              {item.timeLimit && ` ${item.timeLimitOperator === "lte" ? "≤" : item.timeLimitOperator === "lt" ? "<" : item.timeLimitOperator === "gte" ? "≥" : item.timeLimitOperator === "gt" ? ">" : "="} ${item.timeLimit}`})
                                                            </span>
                                                          )}
                                                        </div>
                                                        <span className={`inline-block rounded-full px-1 py-0.5 text-[9px] font-medium ${getTypeColor(item.type)}`}>
                                                          {getTypeLabel(item.type)}
                                                        </span>
                                                      </li>
                                                    );
                                                  })}
                                                </ul>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : upcomingEvents.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">No upcoming tests scheduled</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Schedule a rank testing event to get started
                </p>
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className="mt-4 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Schedule Test
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {upcomingEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border border-gray-200 bg-white p-4 hover:border-primary cursor-pointer transition-colors"
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{event.name}</h3>
                        <p className="text-sm text-gray-600">
                          {formatDate(event.date)}
                          {event.time && ` at ${event.time}`}
                        </p>
                        <p className="text-sm text-gray-500">
                          {event.styleName}
                          {event.location && ` • ${event.location}`}
                        </p>
                        {(() => {
                          const eventStyle = styles.find(s => s.id === event.styleId);
                          if (eventStyle?.testNamingConvention) {
                            return (
                              <p className="text-xs text-gray-400">
                                {eventStyle.testNamingConvention === "FROM_RANK"
                                  ? "Testing FROM this rank level"
                                  : "Testing INTO this rank level"}
                              </p>
                            );
                          }
                          return null;
                        })()}
                        <p className="text-sm text-primary mt-2">
                          {event.participants.length} participant{event.participants.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditEventModal(event);
                          }}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateEvent(event);
                          }}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEvent(event.id);
                          }}
                          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "schedule" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Members Eligible for Testing</h3>
                <Link
                  href="/promotions"
                  className="text-sm text-primary hover:text-primaryDark"
                >
                  View in Promotions →
                </Link>
              </div>
              <p className="text-sm text-gray-500">
                Members who have met the attendance requirements for their next rank are shown here.
                Use the Promotions page to see the full list of eligible members.
              </p>
            </div>

            {/* Testing Criteria Card */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-lg font-medium mb-3">Testing Criteria for {selectedStyle?.name || "Selected Style"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Requirements Checklist</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li className="flex items-center gap-2">
                      <input type="checkbox" className="rounded border-gray-300" disabled checked />
                      <span>Minimum attendance requirement met</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <input type="checkbox" className="rounded border-gray-300" disabled />
                      <span>Time at current rank (configurable)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <input type="checkbox" className="rounded border-gray-300" disabled />
                      <span>Forms/Kata proficiency</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <input type="checkbox" className="rounded border-gray-300" disabled />
                      <span>Sparring evaluation</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <input type="checkbox" className="rounded border-gray-300" disabled />
                      <span>Self-defense techniques</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <input type="checkbox" className="rounded border-gray-300" disabled />
                      <span>Board breaking (if applicable)</span>
                    </li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Testing Options</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-green-500"></span>
                      <span>Individual testing</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                      <span>Group testing events</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                      <span>Stripe/tip testing</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                      <span>Full belt promotion</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "results" && (
          <div className="space-y-4">
            {selectedEvent && pastEvents.some(e => e.id === selectedEvent.id) ? (
              // Past event detail view with editing capability
              <div className="space-y-4">
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-sm text-primary hover:text-primaryDark flex items-center gap-1"
                >
                  ← Back to Results
                </button>

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold">{selectedEvent.name}</h2>
                        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">
                          {selectedEvent.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {formatDate(selectedEvent.date)}
                        {selectedEvent.time && ` at ${selectedEvent.time}`}
                        {selectedEvent.location && ` • ${selectedEvent.location}`}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Style: {selectedEvent.styleName}
                      </p>
                      {selectedEvent.notes && (
                        <p className="text-sm text-gray-500 mt-2" dangerouslySetInnerHTML={{ __html: selectedEvent.notes }} />
                      )}
                      <div className="flex gap-4 mt-2 text-sm">
                        <span className="text-green-600 font-medium">
                          Passed: {selectedEvent.participants.filter(p => p.status === "PASSED").length}
                        </span>
                        <span className="text-red-600 font-medium">
                          Failed: {selectedEvent.participants.filter(p => p.status === "FAILED").length}
                        </span>
                        <span className="text-gray-500">
                          Total: {selectedEvent.participants.length}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {selectedEvent.participants.length > 0 && (
                        <button
                          onClick={openBulkGrading}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          Edit Results (Bulk)
                        </button>
                      )}
                      <button
                        onClick={() => {
                          // Reopen the event for more testing
                          handleReopenEvent(selectedEvent.id);
                        }}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Reopen Event
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(selectedEvent.id)}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-lg font-semibold mb-3">
                      Rank Tests ({(() => {
                        const ranks = [...new Set(selectedEvent.participants.map(p => p.testingForRank || "Unassigned"))];
                        return ranks.length;
                      })()} tests, {selectedEvent.participants.length} participants)
                    </h3>

                    {selectedEvent.participants.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-8">
                        No participants in this test.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {(() => {
                          // Group participants by testingForRank
                          const groupedByRank: Record<string, typeof selectedEvent.participants> = {};
                          const eventStyle = styles.find(s => s.id === selectedEvent.styleId);
                          const styleRanks = eventStyle?.ranks || [];
                          const namingConv = eventStyle?.testNamingConvention || "INTO_RANK";

                          selectedEvent.participants.forEach(p => {
                            const rank = p.testingForRank || "Unassigned";
                            if (!groupedByRank[rank]) {
                              groupedByRank[rank] = [];
                            }
                            groupedByRank[rank].push(p);
                          });

                          // Sort by rank order
                          const sortedRanks = Object.keys(groupedByRank).sort((a, b) => {
                            const aOrder = styleRanks.find(r => r.name === a)?.order ?? 999;
                            const bOrder = styleRanks.find(r => r.name === b)?.order ?? 999;
                            return aOrder - bOrder;
                          });

                          return sortedRanks.map(rankName => {
                            const participants = groupedByRank[rankName];
                            const passedCount = participants.filter(p => p.status === "PASSED").length;
                            const failedCount = participants.filter(p => p.status === "FAILED").length;
                            const incompleteCount = participants.filter(p => p.status !== "PASSED" && p.status !== "FAILED").length;

                            return (
                              <div key={rankName} className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <h4 className="font-semibold text-gray-900">
                                      {rankName} Test
                                    </h4>
                                    <span className="text-sm text-gray-500">
                                      ({participants.length} participant{participants.length !== 1 ? "s" : ""})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs">
                                    {passedCount > 0 && (
                                      <span className="text-green-600 font-medium">{passedCount} passed</span>
                                    )}
                                    {failedCount > 0 && (
                                      <span className="text-red-600 font-medium">{failedCount} failed</span>
                                    )}
                                    {incompleteCount > 0 && (
                                      <span className="text-gray-500 font-medium">{incompleteCount} incomplete</span>
                                    )}
                                  </div>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b bg-gray-50/50">
                                        <th className="text-left py-2 px-2 w-8"></th>
                                        <th className="text-left py-2 px-2">Name</th>
                                        <th className="text-left py-2 px-2">Current Rank</th>
                                        <th className="text-left py-2 px-2">Result</th>
                                        <th className="text-left py-2 px-2">Score</th>
                                        <th className="text-left py-2 px-2">PDF</th>
                                        <th className="text-right py-2 px-2">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {participants.map((p) => {
                                        const isExpanded = expandedParticipants.has(p.id);
                                        const curriculumKey = namingConv === "FROM_RANK" ? p.currentRank : p.testingForRank;
                                        const curriculum = curriculumKey ? curriculaByRank[curriculumKey] : null;
                                        const hasCurriculum = curriculum && curriculum.categories.length > 0;
                                        const parsedItemScores: ItemScores = p.itemScores ? JSON.parse(p.itemScores) : {};

                                        return (
                                          <React.Fragment key={p.id}>
                                            <tr className="border-b hover:bg-gray-50">
                                              <td className="py-2 px-2">
                                                {hasCurriculum && (
                                                  <button
                                                    onClick={() => toggleParticipantExpanded(p.id)}
                                                    className="p-1 text-gray-400 hover:text-gray-600"
                                                    title={isExpanded ? "Hide details" : "Show details"}
                                                  >
                                                    <svg
                                                      className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                                      fill="none"
                                                      stroke="currentColor"
                                                      viewBox="0 0 24 24"
                                                    >
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                  </button>
                                                )}
                                              </td>
                                              <td className="py-2 px-2 font-medium">
                                                <Link href={`/members/${p.memberId}`} className="text-primary hover:underline">
                                                  {p.memberName}
                                                </Link>
                                              </td>
                                              <td className="py-2 px-2">{p.currentRank || "-"}</td>
                                              <td className="py-2 px-2">
                                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(p.status)}`}>
                                                  {p.status}
                                                </span>
                                              </td>
                                              <td className="py-2 px-2">{p.score ?? "-"}%</td>
                                              <td className="py-2 px-2">
                                                {p.resultPdfUrl ? (
                                                  <button
                                                    onClick={() => {
                                                      setViewingPdfUrl(p.resultPdfUrl!);
                                                      setViewingPdfTitle(`${p.memberName} - Test Results`);
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
                                                    </svg>
                                                    View PDF
                                                  </button>
                                                ) : (
                                                  <span className="text-gray-400 text-xs">-</span>
                                                )}
                                              </td>
                                              <td className="py-2 px-2 text-right">
                                                <button
                                                  onClick={() => openGradingSheet(p)}
                                                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark mr-2"
                                                >
                                                  Edit Grade
                                                </button>
                                                <button
                                                  onClick={() => openParticipantModal(p)}
                                                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                                                >
                                                  Details
                                                </button>
                                              </td>
                                            </tr>
                                            {/* Expandable curriculum section */}
                                            {isExpanded && curriculum && (
                                              <tr>
                                                <td colSpan={7} className="bg-gray-50 p-4">
                                                  <div className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                      <h4 className="font-semibold text-sm">
                                                        {curriculum.name} - Test Results
                                                      </h4>
                                                      <span className="text-xs text-gray-500">
                                                        {Object.values(parsedItemScores).filter(s => s.passed).length} / {curriculum.categories.reduce((sum, c) => sum + c.items.length, 0)} passed
                                                      </span>
                                                    </div>
                                                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                                      {curriculum.categories.map((category) => (
                                                        <div key={category.id} className="bg-white border rounded-lg p-3">
                                                          <h5 className="font-medium text-sm mb-2">{category.name}</h5>
                                                          <ul className="space-y-1">
                                                            {category.items.map((item) => {
                                                              const itemScore = parsedItemScores[item.id];
                                                              const isPassed = itemScore?.passed;
                                                              return (
                                                                <li
                                                                  key={item.id}
                                                                  className={`text-xs flex items-start gap-2 ${
                                                                    isPassed ? "text-green-700" : "text-gray-600"
                                                                  }`}
                                                                >
                                                                  <span className={`flex-shrink-0 ${isPassed ? "text-green-500" : "text-gray-300"}`}>
                                                                    {isPassed ? "✓" : "○"}
                                                                  </span>
                                                                  <div className="flex-1 min-w-0">
                                                                    <span className={isPassed ? "" : ""}>
                                                                      {item.name}
                                                                    </span>
                                                                    {itemScore?.notes && (
                                                                      <span className="ml-1 text-gray-400 text-[10px]">
                                                                        ({itemScore.notes})
                                                                      </span>
                                                                    )}
                                                                  </div>
                                                                </li>
                                                              );
                                                            })}
                                                          </ul>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                </td>
                                              </tr>
                                            )}
                                          </React.Fragment>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : pastEvents.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">No test results yet</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Past testing results will appear here after tests are completed
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {pastEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border border-gray-200 bg-white p-4 hover:border-primary cursor-pointer transition-colors"
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{event.name}</h3>
                          <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">
                            {event.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{formatDate(event.date)}</p>
                        <p className="text-sm text-gray-500">{event.styleName}</p>
                        <div className="flex gap-4 mt-2 text-sm">
                          <span className="text-green-600">
                            Passed: {event.participants.filter(p => p.status === "PASSED").length}
                          </span>
                          <span className="text-red-600">
                            Failed: {event.participants.filter(p => p.status === "FAILED").length}
                          </span>
                          <span className="text-gray-500">
                            Total: {event.participants.length}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Click to view/edit</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateEvent(event);
                          }}
                          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEvent(event.id);
                          }}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Schedule/Edit Test Modal */}
        {showScheduleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
              <h2 className="text-lg font-bold mb-4">
                {editingEvent ? "Edit Testing Event" : "Schedule Testing Event"}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Test Name *
                  </label>
                  <input
                    type="text"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    placeholder="e.g., December Belt Test"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Style *
                  </label>
                  <select
                    value={selectedStyleId}
                    onChange={(e) => setSelectedStyleId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {styles.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedStyle?.testNamingConvention && (
                  <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                    <p className="text-sm text-blue-800">
                      <strong>{selectedStyle.name}</strong> uses{" "}
                      {selectedStyle.testNamingConvention === "FROM_RANK" ? (
                        <span>&quot;FROM rank&quot; naming (e.g., &quot;Yellow Belt Test&quot; = yellow belts testing for the next rank)</span>
                      ) : (
                        <span>&quot;INTO rank&quot; naming (e.g., &quot;Yellow Belt Test&quot; = white belts testing for yellow belt)</span>
                      )}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      You can change this in the style settings.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date *
                    </label>
                    <input
                      type="date"
                      value={testDate}
                      onChange={(e) => setTestDate(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Time
                    </label>
                    <input
                      type="time"
                      value={testTime}
                      onChange={(e) => setTestTime(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={testLocation}
                    onChange={(e) => setTestLocation(e.target.value)}
                    placeholder="e.g., Main Training Floor"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes <span className="text-[10px] text-gray-400"></span>
                  </label>
                  <RichTextInput
                    value={testNotes}
                    onChange={setTestNotes}
                    placeholder="Any additional details..."
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={handleScheduleTest}
                  disabled={saving}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving
                    ? (editingEvent ? "Saving..." : "Scheduling...")
                    : (editingEvent ? "Save Changes" : "Schedule Test")
                  }
                </button>
                <button
                  onClick={closeScheduleModal}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Member Modal */}
        {showAddMemberModal && selectedEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] flex flex-col">
              <h2 className="text-lg font-bold mb-2">Add Members to Test</h2>
              <p className="text-sm text-gray-500 mb-4">
                Select members from {selectedEvent.styleName} to add to this test
              </p>

              <div className="space-y-4 flex-1 min-h-0 flex flex-col">
                {/* Search */}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    loadMembers(e.target.value);
                  }}
                  placeholder="Filter members..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />

                {/* Selected count */}
                {selectedMembersForTest.length > 0 && (
                  <div className="flex items-center justify-between bg-primary/10 border border-primary rounded-md px-3 py-2">
                    <span className="text-sm font-medium text-primary">
                      {selectedMembersForTest.length} member{selectedMembersForTest.length !== 1 ? "s" : ""} selected
                    </span>
                    <button
                      onClick={() => setSelectedMembersForTest([])}
                      className="text-xs text-primary hover:text-primaryDark"
                    >
                      Clear all
                    </button>
                  </div>
                )}

                {/* Member list with checkboxes */}
                <div className="flex-1 min-h-0 max-h-64 overflow-y-auto border rounded-md">
                  {loadingMembers ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      Loading members...
                    </div>
                  ) : members.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      {searchQuery ? "No members match your search" : "No members found for this style"}
                    </div>
                  ) : (
                    <>
                      {/* Select All option */}
                      {(() => {
                        const availableMembers = members.filter(m =>
                          !selectedEvent.participants.some(p => p.memberId === m.id)
                        );
                        const allSelected = availableMembers.length > 0 &&
                          availableMembers.every(m => selectedMembersForTest.some(s => s.member.id === m.id));

                        if (availableMembers.length === 0) return null;

                        return (
                          <label className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b cursor-pointer hover:bg-gray-100">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => {
                                if (allSelected) {
                                  // Deselect all
                                  setSelectedMembersForTest([]);
                                } else {
                                  // Select all available members
                                  const newSelections: SelectedMemberForTest[] = availableMembers.map(m => {
                                    let memberRank = "";
                                    let nextRank = "";
                                    if (m.stylesNotes) {
                                      try {
                                        const stylesData = JSON.parse(m.stylesNotes);
                                        const styleData = stylesData.find((s: MemberStyle) => s.name === selectedEvent.styleName);
                                        if (styleData?.rank) {
                                          memberRank = styleData.rank;
                                        }
                                      } catch {}
                                    }
                                    if (memberRank) {
                                      const style = styles.find(s => s.id === selectedEvent.styleId);
                                      if (style?.ranks) {
                                        const sortedRanks = [...style.ranks].sort((a, b) => a.order - b.order);
                                        const currentRankIndex = sortedRanks.findIndex(r => r.name === memberRank);
                                        if (currentRankIndex !== -1 && currentRankIndex < sortedRanks.length - 1) {
                                          nextRank = sortedRanks[currentRankIndex + 1].name;
                                        }
                                      }
                                    }
                                    return { member: m, currentRank: memberRank, testingForRank: nextRank };
                                  });
                                  setSelectedMembersForTest(newSelections);
                                }
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className="text-sm font-medium text-gray-700">
                              Select All ({availableMembers.length})
                            </span>
                          </label>
                        );
                      })()}

                      {members.map((m) => {
                        // Check if already added to test
                        const alreadyAdded = selectedEvent.participants.some(p => p.memberId === m.id);
                        const isSelected = selectedMembersForTest.some(s => s.member.id === m.id);

                        // Get member's rank for this style
                        let memberRank = "";
                        if (m.stylesNotes) {
                          try {
                            const stylesData = JSON.parse(m.stylesNotes);
                            const styleData = stylesData.find((s: MemberStyle) => s.name === selectedEvent.styleName);
                            if (styleData?.rank) {
                              memberRank = styleData.rank;
                            }
                          } catch {}
                        }

                        // Find the next rank for testing
                        let nextRank = "";
                        if (memberRank && selectedEvent) {
                          const style = styles.find(s => s.id === selectedEvent.styleId);
                          if (style?.ranks) {
                            const sortedRanks = [...style.ranks].sort((a, b) => a.order - b.order);
                            const currentRankIndex = sortedRanks.findIndex(r => r.name === memberRank);
                            if (currentRankIndex !== -1 && currentRankIndex < sortedRanks.length - 1) {
                              nextRank = sortedRanks[currentRankIndex + 1].name;
                            }
                          }
                        }

                        return (
                          <label
                            key={m.id}
                            className={`flex items-center gap-3 px-3 py-2 border-b last:border-b-0 ${
                              alreadyAdded
                                ? "bg-gray-50 text-gray-400 cursor-not-allowed"
                                : isSelected
                                ? "bg-primary/5 cursor-pointer"
                                : "hover:bg-gray-50 cursor-pointer"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={alreadyAdded}
                              onChange={() => toggleMemberSelection(m, memberRank, nextRank)}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm">
                                {m.firstName} {m.lastName}
                              </span>
                            </div>
                            <div className="text-right text-xs">
                              {alreadyAdded ? (
                                <span className="text-gray-400">Already added</span>
                              ) : (
                                <div className="text-gray-500">
                                  <div>{memberRank || "No rank"}</div>
                                  {nextRank && <div className="text-primary">→ {nextRank}</div>}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {members.length} member{members.length !== 1 ? "s" : ""} found
                </p>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={handleAddMembers}
                  disabled={selectedMembersForTest.length === 0 || saving}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving ? "Adding..." : `Add ${selectedMembersForTest.length || ""} Member${selectedMembersForTest.length !== 1 ? "s" : ""}`}
                </button>
                <button
                  onClick={() => {
                    setShowAddMemberModal(false);
                    setSelectedMembersForTest([]);
                    setSearchQuery("");
                    setMembers([]);
                    setStyleMembers([]);
                  }}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Participant Modal */}
        {showParticipantModal && editingParticipant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
              <h2 className="text-lg font-bold mb-4">Update Participant</h2>
              <p className="text-sm text-gray-600 mb-4">{editingParticipant.memberName}</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Testing For Rank
                  </label>
                  <select
                    value={participantTestingForRank}
                    onChange={(e) => setParticipantTestingForRank(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select rank...</option>
                    {(() => {
                      const eventStyle = styles.find(s => s.id === selectedEvent?.styleId);
                      return eventStyle?.ranks?.map(rank => (
                        <option key={rank.id} value={rank.name}>{rank.name}</option>
                      )) || [];
                    })()}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={participantStatus}
                    onChange={(e) => setParticipantStatus(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="REGISTERED">Registered</option>
                    <option value="PASSED">Passed</option>
                    <option value="FAILED">Failed</option>
                    <option value="NO_SHOW">No Show</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Score (optional)
                  </label>
                  <input
                    type="number"
                    value={participantScore}
                    onChange={(e) => setParticipantScore(e.target.value)}
                    placeholder="e.g., 85"
                    min="0"
                    max="100"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes <span className="text-[10px] text-gray-400"></span>
                  </label>
                  <RichTextInput
                    value={participantNotes}
                    onChange={setParticipantNotes}
                    placeholder="Any notes about this participant's test..."
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Test Results PDF
                  </label>
                  {participantPdfUrl ? (
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                      <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 18h12a2 2 0 002-2V6a2 2 0 00-2-2h-3.586a1 1 0 01-.707-.293l-1.414-1.414A1 1 0 009.586 2H4a2 2 0 00-2 2v12a2 2 0 002 2zm6-9a1 1 0 00-1 1v4a1 1 0 002 0v-4a1 1 0 00-1-1z"/>
                      </svg>
                      <a
                        href={participantPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex-1 truncate"
                      >
                        View Test Results
                      </a>
                      <button
                        onClick={() => setParticipantPdfUrl("")}
                        className="text-primary hover:text-primaryDark text-xs"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="flex-1 cursor-pointer">
                        <div className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center hover:border-primary transition-colors">
                          <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="mt-1 text-sm text-gray-600">
                            {uploadingPdf ? "Uploading..." : "Click to upload PDF"}
                          </p>
                        </div>
                        <input
                          type="file"
                          accept="application/pdf"
                          onChange={handlePdfUpload}
                          disabled={uploadingPdf}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    PDF will be attached to the member&apos;s profile documents
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={handleUpdateParticipant}
                  disabled={saving}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => {
                    setShowParticipantModal(false);
                    setEditingParticipant(null);
                  }}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Grading Sheet Modal - Mobile Optimized */}
        {showGradingSheet && gradingParticipant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-2 sm:mx-4 max-h-[95vh] flex flex-col">
              {/* Header */}
              <div className="p-3 sm:p-4 border-b shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold truncate">{gradingParticipant.memberName}</h2>
                    {(() => {
                      const eventStyle = styles.find(s => s.id === selectedEvent?.styleId);
                      const namingConv = eventStyle?.testNamingConvention || "INTO_RANK";
                      const displayRank = namingConv === "FROM_RANK" ? gradingParticipant.currentRank : gradingParticipant.testingForRank;
                      const secondaryRank = namingConv === "FROM_RANK" ? gradingParticipant.testingForRank : gradingParticipant.currentRank;
                      const label = namingConv === "FROM_RANK" ? "Current belt:" : "Testing for:";
                      const secondaryLabel = namingConv === "FROM_RANK" ? "testing for" : "from";
                      return (
                        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                          {label} <span className="font-medium">{displayRank || "N/A"}</span>
                          {secondaryRank && (
                            <span className="hidden sm:inline"> ({secondaryLabel} {secondaryRank})</span>
                          )}
                        </p>
                      );
                    })()}
                  </div>
                  <button
                    onClick={closeGradingSheet}
                    className="text-gray-400 hover:text-gray-600 p-1 shrink-0"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-2 sm:p-4">
                {loadingCurriculum ? (
                  <div className="text-center py-8 text-gray-500">
                    Loading curriculum...
                  </div>
                ) : !rankTestCurriculum ? (
                  <div className="text-center py-8">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-900">No curriculum found</h3>
                    {(() => {
                      const gradingStyle = styles.find(s => s.id === selectedEvent?.styleId);
                      const convention = gradingStyle?.testNamingConvention || "INTO_RANK";
                      const expectedRank = convention === "FROM_RANK"
                        ? gradingParticipant.currentRank
                        : gradingParticipant.testingForRank;
                      return (
                        <>
                          <p className="mt-2 text-sm text-gray-500">
                            No test curriculum has been created for <strong>{expectedRank || "this rank"}</strong> in {selectedEvent?.styleName || "this style"}.
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            {convention === "FROM_RANK"
                              ? "Tip: This style uses FROM_RANK naming. Create curriculum for the current rank (what they need to demonstrate to advance)."
                              : "Tip: This style uses INTO_RANK naming. Create curriculum for the target rank (what they need to achieve that rank)."}
                          </p>
                        </>
                      );
                    })()}
                    <Link
                      href="/curriculum"
                      className="mt-4 inline-block text-sm text-primary hover:text-primaryDark"
                    >
                      Create curriculum in Curriculum Builder →
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3 sm:space-y-4">
                    {rankTestCurriculum.categories.map((category) => (
                      <div key={category.id} className="border rounded-lg overflow-hidden">
                        <div className="bg-gray-100 px-3 py-2 sm:px-4 sm:py-3">
                          <h3 className="font-semibold text-sm sm:text-base">{category.name}</h3>
                          {category.description && (
                            <p className="text-xs sm:text-sm text-gray-500 mt-0.5" dangerouslySetInnerHTML={{ __html: category.description }} />
                          )}
                        </div>
                        <div className="divide-y">
                          {category.items.map((item) => {
                            const score = itemScores[item.id];
                            const isPassed = score?.passed ?? false;
                            const isFailed = score?.failed ?? false;
                            const hasTimeLimit = item.timeLimit || item.duration;
                            return (
                              <div key={item.id}>
                                {/* Info row - only show if item has description */}
                                {item.description && (
                                  <div className="px-3 py-2 sm:px-4 bg-gray-50 border-b text-xs text-gray-600 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: item.description }} />
                                )}
                                {/* Curriculum item name row */}
                                <div className="px-3 py-1 sm:px-4 bg-gray-100 border-b flex items-center gap-2 flex-wrap">
                                  <span className="text-sm sm:text-base font-medium">{item.name}</span>
                                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] sm:text-xs font-medium ${getTypeColor(item.type)}`}>
                                    {getTypeLabel(item.type)}
                                  </span>
                                  {(item.reps || item.sets || item.duration || item.distance || item.timeLimit) && (
                                    <span className="text-xs text-gray-500">
                                      {item.sets && `${item.sets}×`}
                                      {item.reps && `${item.reps}`}
                                      {item.duration && ` ${item.duration}`}
                                      {item.distance && ` ${item.distance}`}
                                      {item.timeLimit && ` ${item.timeLimitOperator === "lte" ? "≤" : item.timeLimitOperator === "gte" ? "≥" : "="} ${item.timeLimit}`}
                                    </span>
                                  )}
                                </div>
                                {/* Checkbox row */}
                                <div
                                  className={`p-3 sm:p-4 flex items-start gap-3 transition-colors ${
                                    isPassed ? "bg-green-50" : isFailed ? "bg-red-50" : ""
                                  }`}
                                >
                                  {/* Checkbox - larger on mobile for touch */}
                                  <button
                                    onClick={() => toggleItemPassed(item.id)}
                                    className={`shrink-0 w-8 h-8 sm:w-7 sm:h-7 rounded border-2 flex items-center justify-center transition-colors ${
                                      isPassed
                                        ? "bg-green-500 border-green-500 text-white"
                                        : isFailed
                                        ? "bg-red-500 border-red-500 text-white"
                                        : "border-gray-300 hover:border-primary"
                                    }`}
                                  >
                                    {isPassed && (
                                      <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                    {isFailed && (
                                      <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    )}
                                  </button>

                                  {/* Input area */}
                                  <div className="flex-1 min-w-0">

                                  {/* Time input for timed items, notes for others */}
                                  {hasTimeLimit ? (
                                    <div className="mt-2 flex items-center gap-2">
                                      <label className="text-xs text-gray-500">Time:</label>
                                      <input
                                        type="text"
                                        value={score?.notes || ""}
                                        onChange={(e) => handleItemTimeInput(item.id, e.target.value)}
                                        placeholder="0:00"
                                        className="w-20 sm:w-24 rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                      />
                                    </div>
                                  ) : (
                                    <input
                                      type="text"
                                      value={score?.notes || ""}
                                      onChange={(e) => setItemNotes(item.id, e.target.value)}
                                      placeholder="Notes..."
                                      className="mt-2 w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                  )}
                                </div>

                                {/* Pass/Fail indicator - hidden on mobile, shown on larger screens */}
                                <div className="hidden sm:block text-right shrink-0">
                                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                    isPassed ? "bg-green-100 text-green-800" : isFailed ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-500"
                                  }`}>
                                    {isPassed ? "PASS" : isFailed ? "FAIL" : "---"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Summary - responsive grid */}
                    <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                      <h4 className="font-semibold text-sm mb-2">Summary</h4>
                      <div className="flex flex-wrap gap-3 sm:gap-6 text-xs sm:text-sm">
                        <div>
                          <span className="text-gray-500">Total:</span>{" "}
                          <span className="font-medium">
                            {rankTestCurriculum.categories.reduce((sum, c) => sum + c.items.length, 0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Passed:</span>{" "}
                          <span className="font-medium text-green-600">
                            {Object.values(itemScores).filter(s => s.passed).length}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Failed:</span>{" "}
                          <span className="font-medium text-red-600">
                            {Object.values(itemScores).filter(s => s.failed).length}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Req. Left:</span>{" "}
                          <span className="font-medium text-orange-600">
                            {rankTestCurriculum.categories.reduce((sum, c) =>
                              sum + c.items.filter(item => item.required && !itemScores[item.id]?.passed).length
                            , 0)}
                          </span>
                        </div>
                      </div>
                      {/* Manual Pass/Fail Override */}
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <span className="text-xs text-gray-500 mr-2">Final Result:</span>
                        <div className="inline-flex gap-2 mt-1">
                          <button
                            onClick={() => setManualStatus("PASSED")}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                              manualStatus === "PASSED"
                                ? "bg-green-600 text-white"
                                : "bg-green-100 text-green-700 hover:bg-green-200"
                            }`}
                          >
                            PASS
                          </button>
                          <button
                            onClick={() => setManualStatus("FAILED")}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                              manualStatus === "FAILED"
                                ? "bg-red-600 text-white"
                                : "bg-red-100 text-red-700 hover:bg-red-200"
                            }`}
                          >
                            FAIL
                          </button>
                          {manualStatus && (
                            <button
                              onClick={() => setManualStatus(null)}
                              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                            >
                              (Auto)
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes Sections */}
                {rankTestCurriculum && (
                  <div className="px-3 sm:px-4 pb-3 space-y-3">
                    {/* Notes - included in PDF */}
                    <div className="bg-white border rounded-lg p-3">
                      <div className="mb-2">
                        <h4 className="font-semibold text-sm">Notes</h4>
                        <p className="text-[10px] text-gray-500">Included in PDF </p>
                      </div>
                      <RichTextInput
                        value={individualNotes}
                        onChange={setIndividualNotes}
                        placeholder="Add notes for the test result..."
                        rows={3}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    {/* Admin Notes - NOT included in PDF */}
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="mb-2">
                        <h4 className="font-semibold text-sm">Admin Notes</h4>
                        <p className="text-[10px] text-gray-500">Internal only - NOT included in PDF </p>
                      </div>
                      <RichTextInput
                        value={individualAdminNotes}
                        onChange={setIndividualAdminNotes}
                        placeholder="Add internal admin notes..."
                        rows={3}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-3 sm:p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
                <button
                  onClick={saveGradingSheet}
                  disabled={savingGrades || generatingPdf || !rankTestCurriculum}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {savingGrades ? "Saving..." : generatingPdf ? "Generating PDF..." : "Save"}
                </button>
                <button
                  onClick={closeGradingSheet}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Grading Modal - Mobile Optimized */}
        {showBulkGrading && selectedEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-[95vw] mx-2 sm:mx-4 max-h-[95vh] flex flex-col">
              {/* Header */}
              <div className="p-3 sm:p-4 border-b flex items-start justify-between shrink-0">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold">Bulk Grading</h2>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    {selectedEvent.name}
                  </p>
                </div>
                <button
                  onClick={closeBulkGrading}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto p-2 sm:p-4">
                {loadingBulkCurriculum ? (
                  <div className="text-center py-8 text-gray-500">
                    Loading curriculum...
                  </div>
                ) : !bulkGradingCurriculum ? (
                  <div className="text-center py-8">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-900">No curriculum found</h3>
                    <p className="mt-2 text-sm text-gray-500">
                      Create a curriculum for this rank to enable bulk grading.
                    </p>
                    <Link
                      href="/curriculum"
                      className="mt-4 inline-block text-sm text-primary hover:text-primaryDark"
                    >
                      Create curriculum in Curriculum Builder →
                    </Link>
                  </div>
                ) : (
                  <>
                    {/* Mobile View - Participant Selector + Vertical List */}
                    <div className="md:hidden">
                      {/* Participant Selector */}
                      <div className="mb-4 sticky top-0 bg-white z-10 pb-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Select Participant</label>
                        <select
                          value={mobileSelectedParticipant}
                          onChange={(e) => setMobileSelectedParticipant(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          {selectedEvent.participants.map((p) => {
                            const scores = bulkItemScores[p.id] || {};
                            const totalItems = bulkGradingCurriculum.categories.reduce((sum, c) => sum + c.items.length, 0);
                            const passedItems = Object.values(scores).filter(s => s.passed).length;
                            return (
                              <option key={p.id} value={p.id}>
                                {p.memberName} ({passedItems}/{totalItems})
                              </option>
                            );
                          })}
                        </select>
                        {/* Quick nav buttons */}
                        <div className="flex gap-1 mt-2 overflow-x-auto pb-1">
                          {selectedEvent.participants.map((p, idx) => {
                            const scores = bulkItemScores[p.id] || {};
                            const requiredRemaining = bulkGradingCurriculum.categories.reduce((sum, c) =>
                              sum + c.items.filter(item => item.required && !scores[item.id]?.passed).length
                            , 0);
                            const isSelected = mobileSelectedParticipant === p.id;
                            const isComplete = requiredRemaining === 0;
                            return (
                              <button
                                key={p.id}
                                onClick={() => setMobileSelectedParticipant(p.id)}
                                className={`shrink-0 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                  isSelected
                                    ? "bg-primary text-white"
                                    : isComplete
                                    ? "bg-green-100 text-green-800 hover:bg-green-200"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                }`}
                              >
                                {p.memberName}
                                {isComplete && !isSelected && " ✓"}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Current Participant Summary */}
                      {(() => {
                        const currentP = selectedEvent.participants.find(p => p.id === mobileSelectedParticipant);
                        if (!currentP) return null;
                        const scores = bulkItemScores[currentP.id] || {};
                        const totalItems = bulkGradingCurriculum.categories.reduce((sum, c) => sum + c.items.length, 0);
                        const passedItems = Object.values(scores).filter(s => s.passed).length;
                        const requiredRemaining = bulkGradingCurriculum.categories.reduce((sum, c) =>
                          sum + c.items.filter(item => item.required && !scores[item.id]?.passed).length
                        , 0);
                        const percentScore = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;
                        const eventStyle = styles.find(s => s.id === selectedEvent.styleId);
                        const namingConv = eventStyle?.testNamingConvention || "INTO_RANK";
                        const displayRank = namingConv === "FROM_RANK" ? currentP.currentRank : currentP.testingForRank;
                        return (
                          <div className="mb-3 p-2 bg-gray-50 rounded-lg flex items-center justify-between">
                            <div className="text-xs">
                              <span className="font-medium">{currentP.memberName}</span>
                              <span className="text-gray-500 ml-2">{displayRank}</span>
                            </div>
                            <div className="text-xs">
                              <span className={`font-medium ${requiredRemaining === 0 ? "text-green-600" : "text-gray-600"}`}>
                                {passedItems}/{totalItems} ({percentScore}%)
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Curriculum Items List */}
                      <div className="space-y-3">
                        {bulkGradingCurriculum.categories.map((category) => (
                          <div key={category.id} className="border rounded-lg overflow-hidden">
                            <div className="bg-gray-100 px-3 py-2">
                              <h4 className="font-semibold text-sm">{category.name}</h4>
                            </div>
                            <div className="divide-y">
                              {category.items.map((item) => {
                                const hasTimeInput = item.timeLimit || item.duration;
                                const hasRepsInput = item.reps;
                                const hasInputField = hasTimeInput || hasRepsInput;
                                const score = bulkItemScores[mobileSelectedParticipant]?.[item.id];
                                const isPassed = score?.passed ?? false;
                                const isFailed = score?.failed ?? false;
                                return (
                                  <React.Fragment key={item.id}>
                                    {/* Info row - show if item has description */}
                                    {item.description && (
                                      <div className="px-3 py-2 bg-gray-50 border-b text-xs text-gray-600 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: item.description }} />
                                    )}
                                    {/* Curriculum item name row */}
                                    <div className="px-3 py-1 bg-gray-100 border-b flex items-center gap-2">
                                      <span className="text-sm font-medium">{item.name}</span>
                                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${getTypeColor(item.type)}`}>
                                        {getTypeLabel(item.type)}
                                      </span>
                                      {(item.reps || item.sets || item.duration || item.distance || item.timeLimit) && (
                                        <span className="text-xs text-gray-500">
                                          {item.sets && `${item.sets}×`}
                                          {item.reps && `${item.reps}`}
                                          {item.duration && ` ${item.duration}`}
                                          {item.distance && ` ${item.distance}`}
                                          {item.timeLimit && ` ${item.timeLimitOperator === "lte" ? "≤" : item.timeLimitOperator === "gte" ? "≥" : "="} ${item.timeLimit}`}
                                        </span>
                                      )}
                                    </div>
                                    {/* Checkbox row */}
                                    <div
                                      className={`p-3 flex items-center gap-3 ${isPassed ? "bg-green-50" : isFailed ? "bg-red-50" : ""}`}
                                    >
                                    <button
                                      onClick={() => toggleBulkItemPassed(mobileSelectedParticipant, item.id)}
                                      className={`shrink-0 w-8 h-8 rounded border-2 flex items-center justify-center transition-colors ${
                                        isPassed
                                          ? "bg-green-500 border-green-500 text-white"
                                          : isFailed
                                          ? "bg-red-500 border-red-500 text-white"
                                          : "border-gray-300 hover:border-primary"
                                      }`}
                                    >
                                      {isPassed && (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                      {isFailed && (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      )}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      {hasInputField && (
                                        hasTimeInput ? (
                                          <input
                                            type="text"
                                            value={score?.notes || ""}
                                            onChange={(e) => handleTimeInput(mobileSelectedParticipant, item.id, e.target.value)}
                                            placeholder="0:00"
                                            inputMode="numeric"
                                            className="mt-1 w-full max-w-[150px] text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                                          />
                                        ) : (
                                          <input
                                            type="text"
                                            value={score?.notes || ""}
                                            onChange={(e) => setBulkItemValue(mobileSelectedParticipant, item.id, e.target.value)}
                                            placeholder={item.reps ? `Reps (${item.reps})` : "0"}
                                            inputMode="numeric"
                                            className="mt-1 w-full max-w-[150px] text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                                          />
                                        )
                                      )}
                                    </div>
                                  </div>
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Notes Section - Mobile */}
                      <div className="mt-4 space-y-3">
                        <div className="border rounded-lg overflow-hidden bg-white">
                          <div className="bg-gray-100 px-3 py-2">
                            <h4 className="font-semibold text-sm">Notes</h4>
                            <p className="text-[10px] text-gray-500">Included in PDF </p>
                          </div>
                          <div className="p-3">
                            <RichTextInput
                              value={bulkParticipantNotes[mobileSelectedParticipant] || ""}
                              onChange={(val) => setBulkParticipantNotes(prev => ({ ...prev, [mobileSelectedParticipant]: val }))}
                              placeholder="Add notes..."
                              rows={3}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-primary"
                            />
                          </div>
                        </div>
                        <div className="border rounded-lg overflow-hidden bg-red-50">
                          <div className="bg-red-100 px-3 py-2">
                            <h4 className="font-semibold text-sm">Admin Notes</h4>
                            <p className="text-[10px] text-gray-500">Internal only - NOT in PDF </p>
                          </div>
                          <div className="p-3">
                            <RichTextInput
                              value={bulkAdminNotes[mobileSelectedParticipant] || ""}
                              onChange={(val) => setBulkAdminNotes(prev => ({ ...prev, [mobileSelectedParticipant]: val }))}
                              placeholder="Add admin notes..."
                              rows={3}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-red-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Desktop View - Spreadsheet */}
                    <div className="hidden md:block overflow-x-auto">
                      {/* Information Box - Shows item descriptions above the grading table */}
                      {bulkGradingCurriculum.categories.some(cat => cat.items.some(item => item.description)) && (
                        <div className="mb-4 border border-gray-300 rounded-lg overflow-hidden">
                          <div className="bg-gray-100 px-4 py-2 border-b border-gray-300">
                            <h4 className="font-semibold text-sm">Information</h4>
                          </div>
                          <div className="p-4 bg-white">
                            {bulkGradingCurriculum.categories.flatMap((category) =>
                              category.items.filter(item => item.description).map((item) => (
                                <div
                                  key={item.id}
                                  className="text-xs text-gray-600 whitespace-pre-wrap"
                                  dangerouslySetInnerHTML={{ __html: item.description || "" }}
                                />
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      <table className="min-w-full border-collapse">
                        <thead className="sticky top-0 z-10">
                          {/* Row 1: Names */}
                          <tr className="bg-gray-50">
                            <th className="sticky left-0 z-20 bg-gray-50 border border-gray-300 px-3 py-2 text-left text-sm font-bold text-gray-800 min-w-[200px]">
                              Curriculum Item
                            </th>
                            {selectedEvent.participants.map((p) => (
                              <th
                                key={p.id}
                                className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-gray-700 min-w-[100px] max-w-[120px]"
                              >
                                <div className="truncate" title={p.memberName}>
                                  {p.memberName}
                                </div>
                              </th>
                            ))}
                          </tr>
                          {/* Row 2: Rank info */}
                          <tr className="bg-gray-100">
                            <th className="sticky left-0 z-20 bg-gray-100 border border-gray-300 px-3 py-1 text-left text-xs font-medium min-w-[200px]">
                              Rank
                            </th>
                            {(() => {
                              const eventStyle = styles.find(s => s.id === selectedEvent.styleId);
                              const namingConv = eventStyle?.testNamingConvention || "INTO_RANK";
                              return selectedEvent.participants.map((p) => {
                                const displayRank = namingConv === "FROM_RANK" ? p.currentRank : p.testingForRank;
                                return (
                                  <th
                                    key={`rank-${p.id}`}
                                    className="border border-gray-300 px-2 py-1 text-center text-xs font-normal text-gray-500 min-w-[100px] max-w-[120px]"
                                  >
                                    <div className="truncate">
                                      {displayRank}
                                    </div>
                                  </th>
                                );
                              });
                            })()}
                          </tr>
                        </thead>
                        <tbody>
                          {bulkGradingCurriculum.categories.map((category) => (
                            <React.Fragment key={category.id}>
                              <tr className="bg-gray-50">
                                <td
                                  colSpan={selectedEvent.participants.length + 1}
                                  className="sticky left-0 border border-gray-300 px-3 py-2 text-sm font-bold text-gray-800"
                                >
                                  {category.name}
                                </td>
                              </tr>
                              {category.items.map((item) => {
                                const hasTimeInput = item.timeLimit || item.duration;
                                const hasRepsInput = item.reps;
                                const hasInputField = hasTimeInput || hasRepsInput;
                                return (
                                  <React.Fragment key={item.id}>
                                    {/* Curriculum item name row */}
                                    <tr className="bg-gray-100">
                                      <td
                                        colSpan={selectedEvent.participants.length + 1}
                                        className="border border-gray-300 px-3 py-1"
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-medium">{item.name}</span>
                                          <span className={`shrink-0 inline-block rounded px-1 py-0.5 text-[9px] font-medium ${getTypeColor(item.type)}`}>
                                            {getTypeLabel(item.type)}
                                          </span>
                                          {(item.reps || item.sets || item.duration || item.distance || item.timeLimit) && (
                                            <span className="text-[10px] text-gray-500">
                                              {item.sets && `${item.sets}×`}
                                              {item.reps && `${item.reps}`}
                                              {item.duration && ` ${item.duration}`}
                                              {item.distance && ` ${item.distance}`}
                                              {item.timeLimit && ` ${item.timeLimitOperator === "lte" ? "≤" : item.timeLimitOperator === "gte" ? "≥" : "="} ${item.timeLimit}`}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                    {/* Checkbox row with participant names */}
                                    <tr className="hover:bg-gray-50">
                                    <td className="sticky left-0 z-10 bg-white border border-gray-300 px-3 py-2 text-xs text-gray-500">
                                    </td>
                                    {selectedEvent.participants.map((p) => {
                                      const score = bulkItemScores[p.id]?.[item.id];
                                      const isPassed = score?.passed ?? false;
                                      const isFailed = score?.failed ?? false;
                                      return (
                                        <td
                                          key={p.id}
                                          className={`border border-gray-300 px-1 py-1 text-center align-middle ${
                                            isPassed ? "bg-green-50" : isFailed ? "bg-red-50" : ""
                                          }`}
                                        >
                                          {hasInputField ? (
                                            <div className="flex flex-col items-center gap-1">
                                              <button
                                                onClick={() => toggleBulkItemPassed(p.id, item.id)}
                                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                  isPassed
                                                    ? "bg-green-500 border-green-500 text-white"
                                                    : isFailed
                                                    ? "bg-red-500 border-red-500 text-white"
                                                    : "border-gray-300 hover:border-primary"
                                                }`}
                                              >
                                                {isPassed && (
                                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                  </svg>
                                                )}
                                                {isFailed && (
                                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                                  </svg>
                                                )}
                                              </button>
                                              {hasTimeInput ? (
                                                <input
                                                  type="text"
                                                  value={score?.notes || ""}
                                                  onChange={(e) => handleTimeInput(p.id, item.id, e.target.value)}
                                                  placeholder="0:00"
                                                  inputMode="numeric"
                                                  className="w-full max-w-[50px] text-center text-[10px] border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                                                />
                                              ) : (
                                                <input
                                                  type="text"
                                                  value={score?.notes || ""}
                                                  onChange={(e) => setBulkItemValue(p.id, item.id, e.target.value)}
                                                  placeholder={item.reps ? `${item.reps}` : "0"}
                                                  inputMode="numeric"
                                                  className="w-full max-w-[50px] text-center text-[10px] border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                                                />
                                              )}
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => toggleBulkItemPassed(p.id, item.id)}
                                              className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors mx-auto ${
                                                isPassed
                                                  ? "bg-green-500 border-green-500 text-white"
                                                  : isFailed
                                                  ? "bg-red-500 border-red-500 text-white"
                                                  : "border-gray-300 hover:border-primary"
                                              }`}
                                            >
                                              {isPassed && (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                              )}
                                              {isFailed && (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                              )}
                                            </button>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                  </React.Fragment>
                                );
                              })}
                            </React.Fragment>
                          ))}

                          {/* Notes Row - included in PDF */}
                          <tr className="bg-white">
                            <td className="border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 sticky left-0 bg-white z-10">
                              <div>Notes</div>
                              <div className="font-normal text-[10px] text-gray-500">Included in PDF</div>
                            </td>
                            {selectedEvent.participants.map((p) => (
                              <td key={p.id} className="border border-gray-300 p-1 bg-white">
                                <RichTextInput
                                  value={bulkParticipantNotes[p.id] || ""}
                                  onChange={(val) => setBulkParticipantNotes(prev => ({ ...prev, [p.id]: val }))}
                                  placeholder="Notes..."
                                  rows={2}
                                  className="w-full text-[10px] border border-gray-200 rounded px-1 py-1 focus:ring-1 focus:ring-primary"
                                />
                              </td>
                            ))}
                          </tr>

                          {/* Admin Notes Row - NOT included in PDF */}
                          <tr className="bg-red-50">
                            <td className="border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 sticky left-0 bg-red-50 z-10">
                              <div>Admin Notes</div>
                              <div className="font-normal text-[10px] text-gray-500">Internal only</div>
                            </td>
                            {selectedEvent.participants.map((p) => (
                              <td key={p.id} className="border border-gray-300 p-1 bg-red-50">
                                <RichTextInput
                                  value={bulkAdminNotes[p.id] || ""}
                                  onChange={(val) => setBulkAdminNotes(prev => ({ ...prev, [p.id]: val }))}
                                  placeholder="Admin notes..."
                                  rows={2}
                                  className="w-full text-[10px] border border-gray-200 rounded px-1 py-1 focus:ring-1 focus:ring-red-500"
                                />
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Summary Section */}
                {bulkGradingCurriculum && (
                  <div className="mt-4 bg-gray-50 rounded-lg p-3 sm:p-4">
                    <h4 className="font-semibold text-sm mb-2 sm:mb-3">Summary</h4>

                    {/* Select All Header */}
                    <div className="flex items-center gap-2 mb-2 p-2 bg-white rounded border">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bulkSelectedForStatus.size === selectedEvent.participants.length && selectedEvent.participants.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBulkSelectedForStatus(new Set(selectedEvent.participants.map(p => p.id)));
                            } else {
                              setBulkSelectedForStatus(new Set());
                            }
                          }}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-xs font-semibold">Select All</span>
                      </label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            if (bulkSelectedForStatus.size === 0) return;
                            setBulkManualStatus(prev => {
                              const updated = { ...prev };
                              bulkSelectedForStatus.forEach(id => {
                                updated[id] = "PASSED";
                              });
                              return updated;
                            });
                          }}
                          disabled={bulkSelectedForStatus.size === 0}
                          className="px-2 py-0.5 text-xs font-semibold rounded transition-colors bg-green-100 text-green-700 border border-green-300 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Pass Selected
                        </button>
                        <button
                          onClick={() => {
                            if (bulkSelectedForStatus.size === 0) return;
                            setBulkManualStatus(prev => {
                              const updated = { ...prev };
                              bulkSelectedForStatus.forEach(id => {
                                updated[id] = "FAILED";
                              });
                              return updated;
                            });
                          }}
                          disabled={bulkSelectedForStatus.size === 0}
                          className="px-2 py-0.5 text-xs font-semibold rounded transition-colors bg-red-100 text-red-700 border border-red-300 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Fail Selected
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      {selectedEvent.participants.map((p) => {
                        const scores = bulkItemScores[p.id] || {};
                        const totalItems = bulkGradingCurriculum.categories.reduce((sum, c) => sum + c.items.length, 0);
                        const passedItems = Object.values(scores).filter(s => s.passed).length;
                        const requiredRemaining = bulkGradingCurriculum.categories.reduce((sum, c) =>
                          sum + c.items.filter(item => item.required && !scores[item.id]?.passed).length
                        , 0);
                        const percentScore = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;

                        const currentManualStatus = bulkManualStatus[p.id];
                        const isSelected = bulkSelectedForStatus.has(p.id);
                        return (
                          <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm bg-white rounded px-3 py-2 border gap-2 sm:gap-4">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  setBulkSelectedForStatus(prev => {
                                    const updated = new Set(prev);
                                    if (e.target.checked) {
                                      updated.add(p.id);
                                    } else {
                                      updated.delete(p.id);
                                    }
                                    return updated;
                                  });
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <span className="font-medium text-xs sm:text-sm">{p.memberName}</span>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                              <span className="text-gray-500 text-xs sm:text-sm">
                                {passedItems}/{totalItems} ({percentScore}%)
                              </span>
                              {requiredRemaining > 0 && (
                                <span className="text-orange-600 text-xs">
                                  {requiredRemaining} req left
                                </span>
                              )}
                              <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                                currentManualStatus === "PASSED"
                                  ? "bg-green-600 text-white"
                                  : currentManualStatus === "FAILED"
                                  ? "bg-red-600 text-white"
                                  : "bg-gray-200 text-gray-600"
                              }`}>
                                {currentManualStatus || "INCOMPLETE"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-3 sm:p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
                <button
                  onClick={saveBulkGrades}
                  disabled={savingBulkGrades || generatingPdf || !bulkGradingCurriculum}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {savingBulkGrades ? "Saving..." : generatingPdf ? "Generating PDFs..." : "Save All"}
                </button>
                <button
                  onClick={closeBulkGrading}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PDF Viewer Modal */}
        {viewingPdfUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 h-[85vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b bg-gray-50 rounded-t-lg">
                <h3 className="text-sm font-semibold text-gray-900">{viewingPdfTitle}</h3>
                <div className="flex items-center gap-2">
                  <a
                    href={viewingPdfUrl}
                    download
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => {
                      setViewingPdfUrl(null);
                      setViewingPdfTitle("");
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Close
                  </button>
                </div>
              </div>
              {/* PDF Content */}
              <div className="flex-1 overflow-hidden">
                <iframe
                  src={viewingPdfUrl}
                  className="w-full h-full border-0"
                  title="PDF Viewer"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
