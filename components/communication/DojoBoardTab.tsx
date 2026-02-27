"use client";

import { useEffect, useState, useCallback, useRef } from "react";

function formatTime12h(time: string): string {
  // Handle already-formatted times (e.g. "10:00 AM")
  if (/[ap]m/i.test(time)) return time;
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}:00 ${period}` : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function LinkedText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.startsWith("http") ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "#c41111", textDecoration: "underline", wordBreak: "break-all" }}>{part}</a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  primaryStyle?: string;
  rank?: string;
};

type ChannelFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
  bulletinId?: string;
};

type Bulletin = {
  id: string;
  type: "notice" | "technique" | "testing" | "achievement" | "schedule";
  author: string;
  authorInitials: string;
  title: string;
  content: string;
  timestamp: Date;
  isPriority: boolean;
  pinnedUntil?: Date | null;
  reactions: { type: string; count: number }[];
  replies: Reply[];
  styleTags?: string[];
  mediaUrl?: string;
  attachments?: ChannelFile[];
  channelId?: string;
};

type Reply = {
  id: string;
  author: string;
  authorInitials: string;
  content: string;
  timestamp: Date;
};

type TrainingChannel = {
  id: string;
  name: string;
  description?: string;
  type: "all" | "style" | "rank" | "team" | "custom";
  memberCount: number;
  hasUpdates: boolean;
  visibility?: {
    type: "all" | "styles" | "ranks" | "statuses" | "specific";
    styleIds?: string[];
    rankIds?: string[];
    statuses?: string[];
    memberIds?: string[];
  };
};

type Style = {
  id: string;
  name: string;
  ranks: { id: string; name: string; order: number }[];
};

type PollOption = {
  id: string;
  text: string;
  votes: number;
  voters: string[]; // member IDs who voted for this option
};

type Poll = {
  id: string;
  question: string;
  options: PollOption[];
  author: string;
  authorInitials: string;
  createdAt: Date;
  expiresAt?: Date;
  allowMultiple: boolean;
  isAnonymous: boolean;
  totalVotes: number;
  channelId?: string;
};

type WeeklyFocus = {
  id: string;
  title: string;
  description?: string | null;
  videoUrl?: string | null;
  rankTestItemId?: string | null;
  postedAt?: string | null;
  pinnedUntil?: string | null;
  boardPostId?: string | null;
};

type BoardEvent = {
  sourceType: "testing" | "promotion";
  sourceId: string;
  title: string;
  date: string;
  time?: string | null;
  styleName: string;
  status: string;
  posted: boolean;
};

// Default channel for when no channels exist
const DEFAULT_CHANNEL: TrainingChannel = {
  id: "all",
  name: "All Members",
  type: "all",
  memberCount: 0,
  hasUpdates: false,
};

export default function DojoBoardTab() {
  const [activeChannel, setActiveChannel] = useState<string>("all");
  const [activeView, setActiveView] = useState<"feed" | "events" | "files" | "polls" | "messages">("feed");
  const [bulletins, setBulletins] = useState<Bulletin[]>([]);
  const [channels, setChannels] = useState<TrainingChannel[]>([DEFAULT_CHANNEL]);
  const [showNewBulletin, setShowNewBulletin] = useState(false);
  const [newBulletinType, setNewBulletinType] = useState<Bulletin["type"]>("notice");
  const [newBulletinTitle, setNewBulletinTitle] = useState("");
  const [newBulletinContent, setNewBulletinContent] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [showMemberList, setShowMemberList] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // File attachments state
  const [channelFiles, setChannelFiles] = useState<ChannelFile[]>([]);
  const [newBulletinAttachments, setNewBulletinAttachments] = useState<File[]>([]);

  // Polls state
  const [polls, setPolls] = useState<Poll[]>([]);
  const [showNewPoll, setShowNewPoll] = useState(false);
  const [newPollQuestion, setNewPollQuestion] = useState("");
  const [newPollOptions, setNewPollOptions] = useState<string[]>(["", ""]);
  const [newPollAllowMultiple, setNewPollAllowMultiple] = useState(false);
  const [newPollIsAnonymous, setNewPollIsAnonymous] = useState(false);

  // Board events state
  const [boardEvents, setBoardEvents] = useState<BoardEvent[]>([]);

  // Weekly focus state
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus | null>(null);
  const [showFocusForm, setShowFocusForm] = useState(false);
  const [focusTitle, setFocusTitle] = useState("");
  const [focusDescription, setFocusDescription] = useState("");
  const [focusVideoUrl, setFocusVideoUrl] = useState("");
  const [focusItemId, setFocusItemId] = useState("");
  // Focus post state (pin day/hour loaded from Settings)
  const [focusPinDay, setFocusPinDay] = useState(1); // 0=Sun..6=Sat, default Monday
  const [focusPinHour, setFocusPinHour] = useState(9); // default 9 AM
  const [focusPinConfigured, setFocusPinConfigured] = useState(false); // true once admin has saved a schedule
  const [showFocusPinPicker, setShowFocusPinPicker] = useState(false);

  // Direct Messages state
  const [dmConversations, setDmConversations] = useState<Array<{
    id: string;
    membersVisible: boolean;
    members: Array<{
      id: string;
      firstName: string;
      lastName: string;
      photoUrl: string | null;
      status: string;
      dateOfBirth: string | null;
    }>;
    lastMessage: string;
    lastMessageAt: string;
    lastSenderType: string;
    unreadCount: number;
  }>>([]);
  const [dmSelectedConversationId, setDmSelectedConversationId] = useState<string | null>(null);
  const [dmMessages, setDmMessages] = useState<Array<{
    id: string;
    conversationId: string;
    senderType: string;
    senderId: string | null;
    content: string;
    isRead: boolean;
    createdAt: string;
  }>>([]);
  const [dmConversationMembers, setDmConversationMembers] = useState<Array<{
    id: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    status: string;
    email: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    minorCommsMode: string | null;
  }>>([]);
  const [dmMembersVisible, setDmMembersVisible] = useState(true);
  const [dmNewContent, setDmNewContent] = useState("");
  const [dmShowNewConversation, setDmShowNewConversation] = useState(false);
  const [dmSearchQuery, setDmSearchQuery] = useState("");
  const [dmSelectedMemberIds, setDmSelectedMemberIds] = useState<string[]>([]);
  const [dmNewMembersVisible, setDmNewMembersVisible] = useState(true);
  const dmMessagesEndRef = useRef<HTMLDivElement>(null);

  // Cascading curriculum picker state
  const [focusStyleId, setFocusStyleId] = useState("");
  const [focusRankId, setFocusRankId] = useState("");
  const [focusCategoryId, setFocusCategoryId] = useState("");
  const [focusRankTests, setFocusRankTests] = useState<Array<{
    id: string;
    rank: { id: string; name: string; order: number };
    categories: Array<{
      id: string;
      name: string;
      items: Array<{ id: string; name: string; description: string | null; videoUrl: string | null }>;
    }>;
  }>>([]);

  // Channel creation/edit state
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<TrainingChannel | null>(null);
  const [styles, setStyles] = useState<Style[]>([]);
  const [channelName, setChannelName] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [channelVisibility, setChannelVisibility] = useState<"all" | "styles" | "ranks" | "statuses" | "specific">("all");
  const [selectedStyleIds, setSelectedStyleIds] = useState<string[]>([]);
  const [selectedRankIds, setSelectedRankIds] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // Voter identifier for polls (persisted in localStorage)
  const [voterId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("dojo-board-voter-id");
      if (!id) {
        id = `voter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem("dojo-board-voter-id", id);
      }
      return id;
    }
    return `voter-${Date.now()}`;
  });

  const MEMBER_STATUSES = ["PROSPECT", "ACTIVE", "INACTIVE", "PARENT", "COACH"];

  // Load channels from API
  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/board/channels");
      if (res.ok) {
        const data = await res.json();
        const apiChannels = data.channels || [];
        // Always include default "All Members" channel if not present
        const hasAllChannel = apiChannels.some((c: TrainingChannel) => c.id === "all" || c.type === "all");
        if (!hasAllChannel && apiChannels.length === 0) {
          // Create default channel in DB
          await fetch("/api/board/channels", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "All Members", type: "all" }),
          });
          // Reload
          const res2 = await fetch("/api/board/channels");
          if (res2.ok) {
            const data2 = await res2.json();
            setChannels(data2.channels || [DEFAULT_CHANNEL]);
            if (data2.channels?.length > 0) {
              setActiveChannel(data2.channels[0].id);
            }
          }
        } else {
          setChannels(apiChannels.length > 0 ? apiChannels : [DEFAULT_CHANNEL]);
          if (apiChannels.length > 0 && !apiChannels.find((c: TrainingChannel) => c.id === activeChannel)) {
            setActiveChannel(apiChannels[0].id);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load channels:", err);
    }
  }, [activeChannel]);

  // Load posts from API
  const loadPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/board/posts");
      if (res.ok) {
        const data = await res.json();
        const posts = (data.posts || []).map((post: {
          id: string;
          type: string;
          title: string;
          content: string;
          authorName: string;
          authorInitials: string;
          isPriority: boolean;
          pinnedUntil: string | null;
          styleTags: string | null;
          reactions: string | null;
          channelId: string;
          createdAt: string;
          files: Array<{
            id: string;
            name: string;
            size: number;
            type: string;
            url: string;
            uploadedBy: string;
            createdAt: string;
          }>;
          replies: Array<{
            id: string;
            authorName: string;
            authorInitials: string;
            content: string;
            createdAt: string;
          }>;
        }) => ({
          id: post.id,
          type: post.type as Bulletin["type"],
          author: post.authorName,
          authorInitials: post.authorInitials,
          title: post.title,
          content: post.content,
          timestamp: new Date(post.createdAt),
          isPriority: post.isPriority,
          pinnedUntil: post.pinnedUntil ? new Date(post.pinnedUntil) : null,
          styleTags: post.styleTags ? JSON.parse(post.styleTags) : undefined,
          reactions: post.reactions ? JSON.parse(post.reactions) : [],
          channelId: post.channelId,
          attachments: post.files?.map((f) => ({
            id: f.id,
            name: f.name,
            size: f.size,
            type: f.type,
            url: f.url,
            uploadedBy: f.uploadedBy,
            uploadedAt: new Date(f.createdAt),
            bulletinId: post.id,
          })),
          replies: post.replies?.map((r) => ({
            id: r.id,
            author: r.authorName,
            authorInitials: r.authorInitials,
            content: r.content,
            timestamp: new Date(r.createdAt),
          })) || [],
        }));
        setBulletins(posts);

        // Extract files for the Files tab
        const allFiles: ChannelFile[] = [];
        posts.forEach((post: Bulletin) => {
          if (post.attachments) {
            allFiles.push(...post.attachments);
          }
        });
        setChannelFiles(allFiles);
      }
    } catch (err) {
      console.error("Failed to load posts:", err);
    }
  }, []);

  // Load polls from API
  const loadPolls = useCallback(async () => {
    try {
      const res = await fetch("/api/board/polls");
      if (res.ok) {
        const data = await res.json();
        const apiPolls = (data.polls || []).map((poll: {
          id: string;
          question: string;
          authorName: string;
          authorInitials: string;
          allowMultiple: boolean;
          isClosed: boolean;
          expiresAt: string | null;
          channelId: string;
          createdAt: string;
          options: Array<{
            id: string;
            text: string;
            votes: Array<{ voterId: string }>;
          }>;
        }) => {
          const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
          return {
            id: poll.id,
            question: poll.question,
            author: poll.authorName,
            authorInitials: poll.authorInitials,
            allowMultiple: poll.allowMultiple,
            isAnonymous: false,
            createdAt: new Date(poll.createdAt),
            expiresAt: poll.expiresAt ? new Date(poll.expiresAt) : undefined,
            channelId: poll.channelId,
            totalVotes,
            options: poll.options.map((opt) => ({
              id: opt.id,
              text: opt.text,
              votes: opt.votes.length,
              voters: opt.votes.map((v) => v.voterId),
            })),
          };
        });
        setPolls(apiPolls);
      }
    } catch (err) {
      console.error("Failed to load polls:", err);
    }
  }, []);

  // Load board events from API
  const loadBoardEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/board/events");
      if (res.ok) {
        const data = await res.json();
        setBoardEvents(data.events || []);
      }
    } catch (err) {
      console.error("Failed to load board events:", err);
    }
  }, []);

  // Load weekly focus from API
  const loadWeeklyFocus = useCallback(async () => {
    try {
      const res = await fetch("/api/board/focus");
      if (res.ok) {
        const data = await res.json();
        setWeeklyFocus(data.focus || null);
      }
    } catch (err) {
      console.error("Failed to load weekly focus:", err);
    }
  }, []);

  async function loadFocusPinSettings() {
    try {
      const res = await fetch("/api/settings?key=focus_pin_schedule");
      if (res.ok) {
        const data = await res.json();
        if (data.setting?.value) {
          const parsed = JSON.parse(data.setting.value);
          setFocusPinDay(parsed.day ?? 1);
          setFocusPinHour(parsed.hour ?? 9);
          setFocusPinConfigured(true);
        }
      }
    } catch (err) {
      console.error("Failed to load focus pin settings:", err);
    }
  }

  async function saveFocusPinSettings(day: number, hour: number) {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "focus_pin_schedule",
          value: JSON.stringify({ day, hour }),
        }),
      });
      setFocusPinDay(day);
      setFocusPinHour(hour);
      setFocusPinConfigured(true);
    } catch (err) {
      console.error("Failed to save focus pin settings:", err);
    }
  }

  // Direct Messages loaders
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/direct-messages");
      if (res.ok) {
        const data = await res.json();
        setDmConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  }, []);

  async function loadConversationMessages(conversationId: string) {
    try {
      const res = await fetch(`/api/direct-messages/${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        setDmMessages(data.messages || []);
        setDmConversationMembers(data.members || []);
        setDmMembersVisible(data.membersVisible !== false);
        // Mark messages as read for admin
        await fetch(`/api/direct-messages/${conversationId}`, {
          method: "PATCH",
        });
        loadConversations();
      }
    } catch (err) {
      console.error("Failed to load conversation messages:", err);
    }
  }

  async function sendDirectMessage() {
    if (!dmSelectedConversationId || !dmNewContent.trim()) return;
    try {
      const res = await fetch(`/api/direct-messages/${dmSelectedConversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderType: "admin",
          content: dmNewContent.trim(),
        }),
      });
      if (res.ok) {
        setDmNewContent("");
        loadConversationMessages(dmSelectedConversationId);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  }

  async function createConversationAndSend(content: string) {
    if (dmSelectedMemberIds.length === 0 || !content.trim()) return;
    try {
      const res = await fetch("/api/direct-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds: dmSelectedMemberIds,
          content: content.trim(),
          membersVisible: dmNewMembersVisible,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDmShowNewConversation(false);
        setDmSearchQuery("");
        setDmSelectedMemberIds([]);
        setDmNewMembersVisible(true);
        await loadConversations();
        // Select the new conversation
        setDmSelectedConversationId(data.conversationId);
        loadConversationMessages(data.conversationId);
      }
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  }

  function selectExistingConversation(conversationId: string) {
    setDmSelectedConversationId(conversationId);
    loadConversationMessages(conversationId);
  }

  useEffect(() => {
    dmMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages]);

  useEffect(() => {
    async function loadAll() {
      setIsLoading(true);
      await Promise.all([
        loadMembers(),
        loadStyles(),
        loadChannels(),
        loadPosts(),
        loadPolls(),
        loadBoardEvents(),
        loadWeeklyFocus(),
        loadFocusPinSettings(),
        loadConversations(),
      ]);
      setIsLoading(false);
    }
    loadAll();
  }, [loadChannels, loadPosts, loadPolls, loadBoardEvents, loadWeeklyFocus, loadConversations]);

  async function loadMembers() {
    try {
      const res = await fetch("/api/members");
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch (err) {
      console.error("Failed to load members:", err);
    }
  }

  async function loadStyles() {
    try {
      const res = await fetch("/api/styles");
      if (res.ok) {
        const data = await res.json();
        setStyles(data.styles || []);
      }
    } catch (err) {
      console.error("Failed to load styles:", err);
    }
  }

  function resetChannelForm() {
    setChannelName("");
    setChannelDescription("");
    setChannelVisibility("all");
    setSelectedStyleIds([]);
    setSelectedRankIds([]);
    setSelectedStatuses([]);
    setSelectedMemberIds([]);
    setEditingChannel(null);
  }

  function openAddChannel() {
    resetChannelForm();
    setShowChannelModal(true);
  }

  function openEditChannel(channel: TrainingChannel) {
    setEditingChannel(channel);
    setChannelName(channel.name);
    setChannelDescription(channel.description || "");
    setChannelVisibility(channel.visibility?.type || "all");
    setSelectedStyleIds(channel.visibility?.styleIds || []);
    setSelectedRankIds(channel.visibility?.rankIds || []);
    setSelectedStatuses(channel.visibility?.statuses || []);
    setSelectedMemberIds(channel.visibility?.memberIds || []);
    setShowChannelModal(true);
  }

  async function handleTogglePostEvent(event: BoardEvent) {
    try {
      if (event.posted) {
        // Unpost
        const res = await fetch(
          `/api/board/events?sourceType=${event.sourceType}&sourceId=${event.sourceId}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          await Promise.all([loadBoardEvents(), loadPosts()]);
        }
      } else {
        // Post — also creates a board post in the feed
        const res = await fetch("/api/board/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceType: event.sourceType,
            sourceId: event.sourceId,
            channelId: activeChannel !== "all" ? activeChannel : undefined,
          }),
        });
        if (res.ok) {
          await Promise.all([loadBoardEvents(), loadPosts()]);
        }
      }
    } catch (err) {
      console.error("Failed to toggle board event:", err);
    }
  }

  async function loadRankTestsForStyle(styleId: string) {
    try {
      const res = await fetch(`/api/rank-tests?styleId=${styleId}`);
      if (res.ok) {
        const data = await res.json();
        setFocusRankTests(data.rankTests || []);
      }
    } catch (err) {
      console.error("Failed to load rank tests:", err);
    }
  }

  function handleFocusSelectStyle(styleId: string) {
    setFocusStyleId(styleId);
    setFocusRankId("");
    setFocusCategoryId("");
    setFocusItemId("");
    setFocusRankTests([]);
    if (styleId) loadRankTestsForStyle(styleId);
  }

  function handleFocusSelectRank(rankId: string) {
    setFocusRankId(rankId);
    setFocusCategoryId("");
    setFocusItemId("");
  }

  function handleFocusSelectCategory(categoryId: string) {
    setFocusCategoryId(categoryId);
    setFocusItemId("");
  }

  function handleFocusSelectItem(itemId: string) {
    setFocusItemId(itemId);
    if (!itemId) return;
    // Find the item in the rank tests data
    for (const rt of focusRankTests) {
      for (const cat of rt.categories) {
        const item = cat.items.find((i) => i.id === itemId);
        if (item) {
          setFocusTitle(item.name);
          setFocusDescription(item.description || "");
          setFocusVideoUrl(item.videoUrl || "");
          return;
        }
      }
    }
  }

  function resetFocusForm() {
    setFocusTitle("");
    setFocusDescription("");
    setFocusVideoUrl("");
    setFocusItemId("");
    setFocusStyleId("");
    setFocusRankId("");
    setFocusCategoryId("");
    setFocusRankTests([]);
    setShowFocusForm(false);
  }

  async function handleSaveFocus() {
    if (!focusTitle.trim()) return;
    try {
      const res = await fetch("/api/board/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: focusTitle,
          description: focusDescription,
          videoUrl: focusVideoUrl,
          rankTestItemId: focusItemId || null,
        }),
      });
      if (res.ok) {
        resetFocusForm();
        await loadWeeklyFocus();
      }
    } catch (err) {
      console.error("Failed to save weekly focus:", err);
    }
  }

  async function handleClearFocus() {
    try {
      // If posted, unpost first
      if (weeklyFocus?.postedAt) {
        await fetch("/api/board/focus/post", { method: "DELETE" });
        await loadPosts();
      }
      const res = await fetch("/api/board/focus", { method: "DELETE" });
      if (res.ok) {
        setWeeklyFocus(null);
        setShowFocusPinPicker(false);
      }
    } catch (err) {
      console.error("Failed to clear weekly focus:", err);
    }
  }

  async function handlePostFocus() {
    try {
      const res = await fetch("/api/board/focus/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pinnedUntilDay: focusPinDay,
          pinnedUntilHour: focusPinHour,
          channelId: activeChannel !== "all" ? activeChannel : undefined,
        }),
      });
      if (res.ok) {
        setShowFocusPinPicker(false);
        await Promise.all([loadWeeklyFocus(), loadPosts()]);
      }
    } catch (err) {
      console.error("Failed to post focus:", err);
    }
  }

  async function handleUnpostFocus() {
    try {
      const res = await fetch("/api/board/focus/post", { method: "DELETE" });
      if (res.ok) {
        await Promise.all([loadWeeklyFocus(), loadPosts()]);
      }
    } catch (err) {
      console.error("Failed to unpost focus:", err);
    }
  }

  async function handleSaveChannel() {
    if (!channelName.trim()) return;

    const visibility = {
      type: channelVisibility,
      styleIds: channelVisibility === "styles" ? selectedStyleIds : undefined,
      rankIds: channelVisibility === "ranks" ? selectedRankIds : undefined,
      statuses: channelVisibility === "statuses" ? selectedStatuses : undefined,
      memberIds: channelVisibility === "specific" ? selectedMemberIds : undefined,
    };

    try {
      if (editingChannel) {
        // Update existing channel via API
        const res = await fetch(`/api/board/channels/${editingChannel.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: channelName.trim(),
            description: channelDescription.trim() || null,
            visibility,
          }),
        });
        if (res.ok) {
          await loadChannels();
        }
      } else {
        // Create new channel via API
        const res = await fetch("/api/board/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: channelName.trim(),
            description: channelDescription.trim() || null,
            type: "custom",
            visibility,
          }),
        });
        if (res.ok) {
          await loadChannels();
        }
      }
    } catch (err) {
      console.error("Failed to save channel:", err);
    }

    resetChannelForm();
    setShowChannelModal(false);
  }

  async function handleDeleteChannel(channelId: string) {
    if (!window.confirm("Are you sure you want to delete this channel?")) return;

    try {
      const res = await fetch(`/api/board/channels/${channelId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadChannels();
        if (activeChannel === channelId) {
          const remainingChannels = channels.filter(c => c.id !== channelId);
          setActiveChannel(remainingChannels[0]?.id || "all");
        }
      }
    } catch (err) {
      console.error("Failed to delete channel:", err);
    }

    resetChannelForm();
    setShowChannelModal(false);
  }

  function calculateChannelMemberCount(): number {
    switch (channelVisibility) {
      case "all":
        return members.length;
      case "styles":
        // Count members with matching styles
        return members.filter(m => {
          if (!m.primaryStyle) return false;
          const styleNames = styles.filter(s => selectedStyleIds.includes(s.id)).map(s => s.name.toLowerCase());
          return styleNames.includes(m.primaryStyle.toLowerCase());
        }).length;
      case "statuses":
        return members.filter(m => selectedStatuses.includes(m.status)).length;
      case "specific":
        return selectedMemberIds.length;
      default:
        return 0;
    }
  }

  function toggleStyleSelection(styleId: string) {
    setSelectedStyleIds(prev =>
      prev.includes(styleId)
        ? prev.filter(id => id !== styleId)
        : [...prev, styleId]
    );
  }

  function toggleRankSelection(rankId: string) {
    setSelectedRankIds(prev =>
      prev.includes(rankId)
        ? prev.filter(id => id !== rankId)
        : [...prev, rankId]
    );
  }

  function toggleStatusSelection(status: string) {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  }

  function toggleMemberSelection(memberId: string) {
    setSelectedMemberIds(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  }

  function formatTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files) {
      setNewBulletinAttachments(prev => [...prev, ...Array.from(files)]);
    }
    e.target.value = ""; // Reset input to allow selecting same file again
  }

  function removeAttachment(index: number) {
    setNewBulletinAttachments(prev => prev.filter((_, i) => i !== index));
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function handleCreateBulletin() {
    if (!newBulletinTitle.trim() || !newBulletinContent.trim()) return;

    let fileRecords: { name: string; size: number; type: string; url: string; uploadedBy: string }[] = [];

    // Upload files to local storage
    if (newBulletinAttachments.length > 0) {
      const formData = new FormData();
      newBulletinAttachments.forEach((file) => formData.append("files", file));
      try {
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (uploadRes.ok) {
          const data = await uploadRes.json();
          fileRecords = data.files.map((f: { name: string; size: number; type: string; url: string }) => ({ ...f, uploadedBy: "You" }));
        }
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }

    try {
      const res = await fetch("/api/board/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newBulletinType,
          title: newBulletinTitle.trim(),
          content: newBulletinContent.trim(),
          authorName: "You",
          authorInitials: "YO",
          isPriority: newBulletinType === "testing" || newBulletinType === "schedule",
          channelId: activeChannel,
          files: fileRecords.length > 0 ? fileRecords : undefined,
        }),
      });

      if (res.ok) {
        await loadPosts();
      }
    } catch (err) {
      console.error("Failed to create post:", err);
    }

    setNewBulletinTitle("");
    setNewBulletinContent("");
    setNewBulletinAttachments([]);
    setShowNewBulletin(false);
  }

  function addPollOption() {
    if (newPollOptions.length < 6) {
      setNewPollOptions([...newPollOptions, ""]);
    }
  }

  function removePollOption(index: number) {
    if (newPollOptions.length > 2) {
      setNewPollOptions(newPollOptions.filter((_, i) => i !== index));
    }
  }

  function updatePollOption(index: number, value: string) {
    const updated = [...newPollOptions];
    updated[index] = value;
    setNewPollOptions(updated);
  }

  function resetPollForm() {
    setNewPollQuestion("");
    setNewPollOptions(["", ""]);
    setNewPollAllowMultiple(false);
    setNewPollIsAnonymous(false);
    setShowNewPoll(false);
  }

  async function handleCreatePoll() {
    const validOptions = newPollOptions.filter(opt => opt.trim());
    if (!newPollQuestion.trim() || validOptions.length < 2) return;

    try {
      const res = await fetch("/api/board/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: newPollQuestion.trim(),
          options: validOptions.map(opt => opt.trim()),
          authorName: "You",
          authorInitials: "YO",
          channelId: activeChannel,
          allowMultiple: newPollAllowMultiple,
        }),
      });

      if (res.ok) {
        await loadPolls();
      }
    } catch (err) {
      console.error("Failed to create poll:", err);
    }

    resetPollForm();
  }

  async function handleVote(pollId: string, optionId: string) {
    try {
      const res = await fetch(`/api/board/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optionId,
          voterId: voterId,
          voterName: "You",
        }),
      });

      if (res.ok) {
        await loadPolls();
      }
    } catch (err) {
      console.error("Failed to vote:", err);
    }
  }

  async function handleDeleteBulletin(bulletinId: string) {
    if (!window.confirm("Are you sure you want to delete this post?")) return;

    try {
      const res = await fetch(`/api/board/posts/${bulletinId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await Promise.all([loadPosts(), loadWeeklyFocus(), loadBoardEvents()]);
      }
    } catch (err) {
      console.error("Failed to delete post:", err);
    }
  }

  async function handleReaction(bulletinId: string, reactionType: string) {
    // Find current bulletin and update reactions
    const bulletin = bulletins.find(b => b.id === bulletinId);
    if (!bulletin) return;

    const existingReaction = bulletin.reactions.find(r => r.type === reactionType);
    let updatedReactions;
    if (existingReaction) {
      updatedReactions = bulletin.reactions.map(r =>
        r.type === reactionType ? { ...r, count: r.count + 1 } : r
      );
    } else {
      updatedReactions = [...bulletin.reactions, { type: reactionType, count: 1 }];
    }

    try {
      const res = await fetch(`/api/board/posts/${bulletinId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reactions: updatedReactions,
        }),
      });

      if (res.ok) {
        await loadPosts();
      }
    } catch (err) {
      console.error("Failed to add reaction:", err);
    }
  }

  function getChannelIcon(type: TrainingChannel["type"]) {
    switch (type) {
      case "all": return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
      case "style": return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
      case "rank": return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      );
      case "team": return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
      case "custom": return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
        </svg>
      );
      default: return null;
    }
  }

  function getBulletinIcon(type: Bulletin["type"]) {
    switch (type) {
      case "testing": return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
      case "technique": return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
      case "achievement": return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      );
      case "schedule": return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
      default: return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
        </svg>
      );
    }
  }

  const channelBulletins = activeChannel
    ? bulletins.filter(b => b.channelId === activeChannel)
    : bulletins;
  const now = new Date();
  const isStillPinned = (b: Bulletin) =>
    b.isPriority && (!b.pinnedUntil || b.pinnedUntil >= now);
  const priorityBulletins = channelBulletins.filter(isStillPinned);
  const regularBulletins = channelBulletins.filter(b => !isStillPinned(b));

  const channelPostIds = new Set(channelBulletins.map(b => b.id));
  const filteredChannelFiles = channelFiles.filter(f => f.bulletinId && channelPostIds.has(f.bulletinId));

  const channelPolls = activeChannel
    ? polls.filter(p => p.channelId === activeChannel)
    : polls;

  const reactionLabels: Record<string, { emoji: string; label: string }> = {
    attending: { emoji: "🥋", label: "Attending" },
    helpful: { emoji: "💪", label: "Helpful" },
    practicing: { emoji: "🎯", label: "Practicing" },
    congrats: { emoji: "🏆", label: "Congrats" },
    noted: { emoji: "✅", label: "Noted" },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading Dojo Board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">

        <div className="flex h-[calc(100vh-10rem)] gap-4">
          {/* Left Sidebar - Training Channels */}
          <div className="w-60 shrink-0 rounded-lg border border-gray-200 bg-white overflow-hidden flex flex-col">
            <div className="p-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Training Channels</h2>
            </div>
          <div className="flex-1 overflow-y-auto">
            {channels.map((channel) => (
              <div
                key={channel.id}
                className={`group flex items-center gap-2 px-3 py-2.5 transition-colors ${
                  activeChannel === channel.id && activeView !== "messages" && activeView !== "events"
                    ? "bg-primary/10 border-l-2 border-primary"
                    : "hover:bg-gray-50"
                }`}
              >
                <button
                  onClick={() => { setActiveChannel(channel.id); if (activeView === "messages" || activeView === "events") setActiveView("feed"); }}
                  className="flex-1 flex items-center gap-3 text-left"
                >
                  <div className={`p-1.5 rounded-md ${activeChannel === channel.id && activeView !== "messages" && activeView !== "events" ? "bg-primary text-white" : "bg-gray-200 text-gray-600"}`}>
                    {getChannelIcon(channel.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                      {channel.name}
                      {channel.hasUpdates && (
                        <span className="w-2 h-2 bg-primary rounded-full"></span>
                      )}
                    </div>
                  </div>
                </button>
                {/* Edit button - always visible for non-all channels */}
                {channel.id !== "all" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditChannel(channel); }}
                    className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded transition-colors"
                    title="Edit channel"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-gray-200">
            <button
              onClick={openAddChannel}
              className="w-full rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
            >
              Add Channel
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 rounded-lg border border-gray-200 bg-white overflow-hidden">
          {/* Tabs */}
          <div className="flex gap-1 px-4 bg-gray-50 border-b border-gray-200">
            {[
              { id: "feed", label: "Feed", icon: "M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" },
              { id: "events", label: "Events", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
              { id: "files", label: "Files", icon: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
              { id: "polls", label: "Polls", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
              { id: "messages", label: "Messages", icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id as typeof activeView)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeView === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
                {tab.id === "messages" && dmConversations.reduce((sum, c) => sum + c.unreadCount, 0) > 0 && (
                  <span className="bg-primary text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                    {dmConversations.reduce((sum, c) => sum + c.unreadCount, 0)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Channel Title — shown for channel-based views */}
          {(activeView === "feed" || activeView === "files" || activeView === "polls") && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
              <h1 className="text-sm font-semibold text-gray-900">
                {channels.find(c => c.id === activeChannel)?.name || "All Members"}
              </h1>
              <button
                onClick={() => setShowMemberList(true)}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
                title="View Students"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
                </svg>
              </button>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            {activeView === "feed" && (
              <div className="p-4 space-y-4">
                {/* New Bulletin Button */}
                {!showNewBulletin ? (
                  <button
                    onClick={() => setShowNewBulletin(true)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-semibold">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <span className="text-sm text-gray-500">Post to the dojo board...</span>
                  </button>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs font-medium text-gray-600">Type:</label>
                      {[
                        { value: "notice", label: "Notice", color: "bg-gray-100 text-gray-700" },
                        { value: "technique", label: "Technique", color: "bg-blue-100 text-blue-700" },
                        { value: "testing", label: "Belt Testing", color: "bg-amber-100 text-amber-700" },
                        { value: "achievement", label: "Achievement", color: "bg-green-100 text-green-700" },
                        { value: "schedule", label: "Schedule", color: "bg-primary/10 text-primary" },
                      ].map((type) => (
                        <button
                          key={type.value}
                          onClick={() => setNewBulletinType(type.value as Bulletin["type"])}
                          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                            newBulletinType === type.value
                              ? type.color + " ring-2 ring-offset-1 ring-primary"
                              : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={newBulletinTitle}
                      onChange={(e) => setNewBulletinTitle(e.target.value)}
                      placeholder="Title"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <textarea
                      value={newBulletinContent}
                      onChange={(e) => setNewBulletinContent(e.target.value)}
                      placeholder="Write your message..."
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                      rows={4}
                    />
                    {/* File Attachments */}
                    <div className="space-y-2">
                      {newBulletinAttachments.length > 0 && (
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            <span className="text-xs font-semibold text-primary">{newBulletinAttachments.length} file{newBulletinAttachments.length > 1 ? "s" : ""} attached</span>
                          </div>
                          <div className="space-y-1">
                            {newBulletinAttachments.map((file, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-2 px-2 py-1.5 bg-white rounded-md text-xs border border-gray-200"
                              >
                                {file.type.startsWith("image/") ? (
                                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                ) : file.type.includes("pdf") ? (
                                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                  </svg>
                                ) : file.type.includes("video") ? (
                                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                )}
                                <span className="text-gray-700 flex-1 truncate">{file.name}</span>
                                <span className="text-gray-400 shrink-0">({formatFileSize(file.size)})</span>
                                <button
                                  onClick={() => removeAttachment(index)}
                                  className="text-gray-400 hover:text-primary shrink-0"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.multiple = true;
                          input.onchange = (e) => {
                            const files = (e.target as HTMLInputElement).files;
                            if (files) {
                              setNewBulletinAttachments(prev => [...prev, ...Array.from(files)]);
                            }
                          };
                          input.click();
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer px-3 py-1.5 rounded-md bg-primary text-white hover:bg-primaryDark transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        {newBulletinAttachments.length > 0 ? "Add more files" : "Add Attachment"}
                      </button>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={handleCreateBulletin}
                        disabled={!newBulletinTitle.trim() || !newBulletinContent.trim()}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                      >
                        Post
                      </button>
                      <button
                        onClick={() => { setShowNewBulletin(false); setNewBulletinTitle(""); setNewBulletinContent(""); setNewBulletinAttachments([]); }}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Priority Bulletins */}
                {priorityBulletins.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                      <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Priority
                    </h3>
                    {priorityBulletins.map((bulletin) => (
                      <BulletinCard
                        key={bulletin.id}
                        bulletin={bulletin}
                        onReaction={handleReaction}
                        onDelete={handleDeleteBulletin}
                        formatTimeAgo={formatTimeAgo}
                        formatFileSize={formatFileSize}
                        getBulletinIcon={getBulletinIcon}
                        reactionLabels={reactionLabels}
                      />
                    ))}
                  </div>
                )}

                {/* Regular Bulletins */}
                <div className="space-y-3">
                  {priorityBulletins.length > 0 && regularBulletins.length > 0 && (
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent</h3>
                  )}
                  {regularBulletins.map((bulletin) => (
                    <BulletinCard
                      key={bulletin.id}
                      bulletin={bulletin}
                      onReaction={handleReaction}
                      onDelete={handleDeleteBulletin}
                      formatTimeAgo={formatTimeAgo}
                      formatFileSize={formatFileSize}
                      getBulletinIcon={getBulletinIcon}
                      reactionLabels={reactionLabels}
                    />
                  ))}
                </div>
              </div>
            )}

            {activeView === "events" && (
              <div className="p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">Channel Events</h3>
                </div>
                <div className="space-y-3">
                  {/* Placeholder for events - will be connected to calendar */}
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm">No events for this channel yet</p>
                    <p className="text-xs mt-1">Events can be linked from the Calendar page</p>
                  </div>
                </div>
              </div>
            )}

            {activeView === "files" && (
              <div className="p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">Channel Files</h3>
                  <p className="text-xs text-gray-500 mt-1">Files attached to posts appear here automatically</p>
                </div>
                {filteredChannelFiles.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm">No files uploaded yet</p>
                    <p className="text-xs mt-1">Attach files to posts in the Feed tab</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredChannelFiles.map((file) => (
                      <div
                        key={file.id}
                        className="rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-primary/50 transition-colors"
                      >
                        {/* Image preview */}
                        {file.type.startsWith("image/") && (
                          <div className="bg-gray-100 flex items-center justify-center p-2">
                            <img
                              src={file.url}
                              alt={file.name}
                              className="max-h-80 w-auto object-contain rounded"
                            />
                          </div>
                        )}
                        {/* Video preview */}
                        {file.type.startsWith("video/") && (
                          <div className="bg-black">
                            <video
                              src={file.url}
                              controls
                              className="max-h-80 w-full"
                            />
                          </div>
                        )}
                        {/* PDF preview - show iframe for PDFs */}
                        {file.type.includes("pdf") && (
                          <div className="bg-gray-100 h-96">
                            <iframe
                              src={file.url}
                              className="w-full h-full border-0"
                              title={file.name}
                            />
                          </div>
                        )}
                        {/* Non-previewable files - show icon */}
                        {!file.type.startsWith("image/") && !file.type.startsWith("video/") && !file.type.includes("pdf") && (
                          <div className="bg-gray-50 py-8 flex flex-col items-center justify-center">
                            <div className="p-4 rounded-full bg-gray-200 text-gray-500 mb-2">
                              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <span className="text-sm text-gray-500">Preview not available</span>
                          </div>
                        )}
                        {/* File info bar */}
                        <div className="flex items-center gap-3 p-3 border-t border-gray-100">
                          <div className="p-2 rounded-md bg-gray-100 text-gray-600">
                            {file.type.startsWith("image/") ? (
                              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            ) : file.type.includes("pdf") ? (
                              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            ) : file.type.startsWith("video/") ? (
                              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {file.name}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>{formatFileSize(file.size)}</span>
                              <span>•</span>
                              <span>Uploaded by {file.uploadedBy}</span>
                              <span>•</span>
                              <span>{formatTimeAgo(file.uploadedAt)}</span>
                            </div>
                          </div>
                          <a
                            href={file.url}
                            download={file.name}
                            className="p-2 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-md transition-colors"
                            title="Download"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeView === "polls" && (
              <div className="p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">Channel Polls</h3>
                  <p className="text-xs text-gray-500 mt-1">Create polls to gather feedback from members</p>
                </div>

                {/* Create Poll Button/Form */}
                {!showNewPoll ? (
                  <button
                    onClick={() => setShowNewPoll(true)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors mb-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-semibold">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <span className="text-sm text-gray-500">Create a new poll...</span>
                  </button>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Question</label>
                      <input
                        type="text"
                        value={newPollQuestion}
                        onChange={(e) => setNewPollQuestion(e.target.value)}
                        placeholder="Ask a question..."
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-2">Options</label>
                      <div className="space-y-2">
                        {newPollOptions.map((option, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={option}
                              onChange={(e) => updatePollOption(index, e.target.value)}
                              placeholder={`Option ${index + 1}`}
                              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            {newPollOptions.length > 2 && (
                              <button
                                onClick={() => removePollOption(index)}
                                className="p-1.5 text-gray-400 hover:text-primary"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                        {newPollOptions.length < 6 && (
                          <button
                            onClick={addPollOption}
                            className="text-xs text-primary hover:text-primaryDark font-medium flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add option
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newPollAllowMultiple}
                          onChange={(e) => setNewPollAllowMultiple(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        Allow multiple choices
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newPollIsAnonymous}
                          onChange={(e) => setNewPollIsAnonymous(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        Anonymous voting
                      </label>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={handleCreatePoll}
                        disabled={!newPollQuestion.trim() || newPollOptions.filter(o => o.trim()).length < 2}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                      >
                        Create Poll
                      </button>
                      <button
                        onClick={resetPollForm}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Polls List */}
                {channelPolls.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p className="text-sm">No polls yet</p>
                    <p className="text-xs mt-1">Create a poll to gather feedback from members</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {channelPolls.map((poll) => {
                      const maxVotes = Math.max(...poll.options.map(o => o.votes), 1);
                      const hasVoted = poll.options.some(o => o.voters.includes(voterId));

                      return (
                        <div key={poll.id} className="rounded-lg border border-gray-200 bg-white p-4">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-semibold text-sm">
                              {poll.authorInitials}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900 text-sm">{poll.author}</span>
                                {poll.allowMultiple && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Multiple choice</span>
                                )}
                                {poll.isAnonymous && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Anonymous</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">{formatTimeAgo(poll.createdAt)}</p>
                            </div>
                          </div>

                          <h4 className="font-semibold text-gray-900 mb-3">{poll.question}</h4>

                          <div className="space-y-2">
                            {poll.options.map((option) => {
                              const percentage = poll.totalVotes > 0 ? Math.round((option.votes / poll.totalVotes) * 100) : 0;
                              const isSelected = option.voters.includes(voterId);

                              return (
                                <button
                                  key={option.id}
                                  onClick={() => handleVote(poll.id, option.id)}
                                  className={`w-full text-left rounded-lg border p-3 transition-colors relative overflow-hidden ${
                                    isSelected
                                      ? "border-primary bg-primary/5"
                                      : "border-gray-200 hover:border-gray-300"
                                  }`}
                                >
                                  {/* Progress bar background */}
                                  {hasVoted && (
                                    <div
                                      className="absolute inset-y-0 left-0 bg-primary/10 transition-all duration-300"
                                      style={{ width: `${percentage}%` }}
                                    />
                                  )}
                                  <div className="relative flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                        isSelected ? "border-primary bg-primary" : "border-gray-300"
                                      }`}>
                                        {isSelected && (
                                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                      </div>
                                      <span className="text-sm text-gray-700">{option.text}</span>
                                    </div>
                                    {hasVoted && (
                                      <span className="text-sm font-medium text-gray-600">{percentage}%</span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          <div className="mt-3 text-xs text-gray-500">
                            {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
                            {hasVoted && " • You voted"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeView === "messages" && (
              <div className="flex h-full">
                {/* Left Panel - Conversation List */}
                <div className="w-72 shrink-0 border-r border-gray-200 flex flex-col">
                  <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">Messages</h3>
                    <button
                      onClick={() => setDmShowNewConversation(true)}
                      className="p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors"
                      title="New Message"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {dmConversations.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <p className="text-sm">No conversations yet</p>
                        <p className="text-xs mt-1">Start a conversation with a member</p>
                      </div>
                    ) : (
                      dmConversations.map((conv) => {
                        const convName = conv.members.length === 1
                          ? `${conv.members[0].firstName} ${conv.members[0].lastName}`
                          : conv.members.map(m => m.firstName).join(", ");
                        const initials = conv.members.length === 1
                          ? `${conv.members[0].firstName[0]}${conv.members[0].lastName?.[0] || ""}`
                          : conv.members.length <= 2
                            ? conv.members.map(m => m.firstName[0]).join("")
                            : `${conv.members[0].firstName[0]}+${conv.members.length - 1}`;
                        const hasMinor = conv.members.some(m => {
                          if (!m.dateOfBirth) return false;
                          const age = Math.floor((Date.now() - new Date(m.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                          return age < 18;
                        });
                        return (
                          <button
                            key={conv.id}
                            onClick={() => selectExistingConversation(conv.id)}
                            className={`w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                              dmSelectedConversationId === conv.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full ${conv.members.length > 1 ? "bg-purple-600" : "bg-primary"} text-white flex items-center justify-center text-xs font-bold shrink-0`}>
                                {initials}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-900 truncate">
                                    {convName}
                                    {hasMinor && <span className="ml-1 text-[10px] text-orange-500" title="Includes minor">&bull;</span>}
                                  </span>
                                  <span className="text-xs text-gray-400 shrink-0 ml-2">
                                    {formatTimeAgo(new Date(conv.lastMessageAt))}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <p className="text-xs text-gray-500 truncate">
                                    {conv.lastSenderType === "admin" ? "You: " : ""}{conv.lastMessage}
                                  </p>
                                  {conv.unreadCount > 0 && (
                                    <span className="ml-2 bg-primary text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center shrink-0">
                                      {conv.unreadCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right Panel - Conversation Thread */}
                <div className="flex-1 flex flex-col min-w-0">
                  {!dmSelectedConversationId ? (
                    <div className="flex-1 flex items-center justify-center text-gray-400">
                      <div className="text-center">
                        <svg className="w-16 h-16 mx-auto mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <p className="text-sm">Select a conversation or start a new one</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Conversation Header */}
                      {dmConversationMembers.length > 0 && (
                        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full ${dmConversationMembers.length > 1 ? "bg-purple-600" : "bg-primary"} text-white flex items-center justify-center text-xs font-bold`}>
                            {dmConversationMembers.length === 1
                              ? `${dmConversationMembers[0].firstName[0]}${dmConversationMembers[0].lastName?.[0] || ""}`
                              : dmConversationMembers.length <= 2
                                ? dmConversationMembers.map(m => m.firstName[0]).join("")
                                : `${dmConversationMembers[0].firstName[0]}+${dmConversationMembers.length - 1}`}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">
                              {dmConversationMembers.map(m => `${m.firstName} ${m.lastName}`).join(", ")}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                              {dmConversationMembers.length === 1 ? (
                                <span>{dmConversationMembers[0].status}{dmConversationMembers[0].email ? ` \u2022 ${dmConversationMembers[0].email}` : ""}</span>
                              ) : (
                                <span>{dmConversationMembers.length} members</span>
                              )}
                              {dmConversationMembers.some(m => {
                                if (!m.dateOfBirth) return false;
                                const age = Math.floor((Date.now() - new Date(m.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                                return age < 18;
                              }) && (
                                <span className="text-orange-500 text-[10px] font-medium">
                                  {dmConversationMembers.some(m => m.minorCommsMode === "parent_only") ? "Parent only" : "Includes minor"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Messages Thread */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {dmMessages.length === 0 && (
                          <p className="text-center text-sm text-gray-400 py-8">No messages yet. Send the first message below.</p>
                        )}
                        {dmMessages.map((msg) => {
                          const senderMember = msg.senderId ? dmConversationMembers.find(m => m.id === msg.senderId) : null;
                          return (
                            <div
                              key={msg.id}
                              className={`flex ${msg.senderType === "admin" ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={`max-w-[70%] rounded-lg px-3 py-2 ${
                                  msg.senderType === "admin"
                                    ? "bg-primary text-white"
                                    : "bg-gray-100 text-gray-900"
                                }`}
                              >
                                {msg.senderType === "member" && dmConversationMembers.length > 1 && senderMember && (
                                  <p className="text-[10px] font-semibold text-gray-600 mb-0.5">{senderMember.firstName}</p>
                                )}
                                <LinkedText
                                  text={msg.content}
                                  className={`text-sm whitespace-pre-wrap ${msg.senderType === "admin" ? "text-white" : ""}`}
                                />
                                <p className={`text-[10px] mt-1 ${
                                  msg.senderType === "admin" ? "text-white/70" : "text-gray-400"
                                }`}>
                                  {formatTimeAgo(new Date(msg.createdAt))}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={dmMessagesEndRef} />
                      </div>

                      {/* Compose Input */}
                      <div className="p-3 border-t border-gray-200 bg-white">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={dmNewContent}
                            onChange={(e) => setDmNewContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                sendDirectMessage();
                              }
                            }}
                            placeholder="Type a message..."
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <button
                            onClick={sendDirectMessage}
                            disabled={!dmNewContent.trim()}
                            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primaryDark disabled:opacity-50 transition-colors"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - Quick Info */}
        <div className="w-56 shrink-0 space-y-4">
          {/* Upcoming Events */}
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Upcoming
            </h3>

            {boardEvents.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">No upcoming events</p>
            ) : (
              <div className="space-y-2">
                {boardEvents.map((event) => {
                  const label = event.sourceType === "testing" ? "Testing" : "Promotion";
                  return (
                    <div
                      key={`${event.sourceType}-${event.sourceId}`}
                      className={`p-2 rounded-md border ${
                        event.posted
                          ? "bg-primary/5 border-primary/20"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <div className={`text-xs font-semibold truncate ${event.posted ? "text-primary" : "text-gray-700"}`}>
                            {event.title}
                          </div>
                          <div className={`text-xs ${event.posted ? "text-primary/70" : "text-gray-500"}`}>
                            {new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {event.time ? `, ${formatTime12h(event.time)}` : ""}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{label} &middot; {event.styleName}</div>
                        </div>
                        <button
                          onClick={() => handleTogglePostEvent(event)}
                          className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            event.posted
                              ? "bg-primary/10 text-primary hover:bg-primary/20"
                              : "bg-primary text-white hover:bg-primaryDark"
                          }`}
                          title={event.posted ? "Unpost from board" : "Post to board"}
                        >
                          {event.posted ? "Posted" : "Post"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Focus This Week (Admin Only) */}
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Focus This Week
            </h3>

            {weeklyFocus ? (
              <div>
                <div className={`p-2 rounded-md border ${
                  weeklyFocus.postedAt
                    ? "bg-primary/5 border-primary/20"
                    : "bg-gray-50 border-gray-200"
                }`}>
                  {/* Title row with Post button */}
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <div className={`text-xs font-semibold truncate ${weeklyFocus.postedAt ? "text-primary" : "text-gray-700"}`}>{weeklyFocus.title}</div>
                    </div>
                    <button
                      onClick={weeklyFocus.postedAt ? handleUnpostFocus : (focusPinConfigured ? handlePostFocus : () => setShowFocusPinPicker(true))}
                      className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        weeklyFocus.postedAt
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : "bg-primary text-white hover:bg-primaryDark"
                      }`}
                      title={weeklyFocus.postedAt ? "Unpost from board" : "Post to board"}
                    >
                      {weeklyFocus.postedAt ? "Posted" : "Post"}
                    </button>
                  </div>
                  {weeklyFocus.description && (
                    <p className={`text-xs mt-1 ${weeklyFocus.postedAt ? "text-primary/70" : "text-gray-500"}`}>{weeklyFocus.description}</p>
                  )}
                  {weeklyFocus.videoUrl && (
                    <a
                      href={weeklyFocus.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primaryDark font-medium mt-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Watch Video
                    </a>
                  )}
                  {/* Pin schedule info */}
                  {weeklyFocus.postedAt && weeklyFocus.pinnedUntil && !showFocusPinPicker && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      Pinned until {new Date(weeklyFocus.pinnedUntil).toLocaleDateString("en-US", { weekday: "short" })}{" "}
                      {new Date(weeklyFocus.pinnedUntil).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                      <button
                        onClick={() => setShowFocusPinPicker(true)}
                        className="ml-1 underline hover:text-gray-600"
                      >
                        change
                      </button>
                    </p>
                  )}
                  {!weeklyFocus.postedAt && focusPinConfigured && !showFocusPinPicker && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      Pins until {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][focusPinDay]}{" "}
                      {`${focusPinHour % 12 || 12}:00 ${focusPinHour >= 12 ? "PM" : "AM"}`}
                      <button
                        onClick={() => setShowFocusPinPicker(true)}
                        className="ml-1 underline hover:text-gray-600"
                      >
                        change
                      </button>
                    </p>
                  )}
                </div>
                {showFocusPinPicker && (
                  <div className="rounded border border-gray-200 bg-gray-50 p-2 mb-2 space-y-2">
                    <p className="text-[10px] font-medium text-gray-600">
                      {weeklyFocus.postedAt ? "Change pin time:" : focusPinConfigured ? "Change pin schedule:" : "Set pin schedule:"}
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={focusPinDay}
                        onChange={(e) => setFocusPinDay(Number(e.target.value))}
                        className="flex-1 rounded border border-gray-300 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => (
                          <option key={i} value={i}>{day}</option>
                        ))}
                      </select>
                      <select
                        value={focusPinHour}
                        onChange={(e) => setFocusPinHour(Number(e.target.value))}
                        className="w-24 rounded border border-gray-300 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {Array.from({ length: 24 }, (_, h) => {
                          const period = h >= 12 ? "PM" : "AM";
                          const hour = h % 12 || 12;
                          return <option key={h} value={h}>{`${hour}:00 ${period}`}</option>;
                        })}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await saveFocusPinSettings(focusPinDay, focusPinHour);
                          if (weeklyFocus.postedAt) {
                            // Update the pin time on the already-posted focus and board post
                            await fetch("/api/board/focus/post", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ pinnedUntilDay: focusPinDay, pinnedUntilHour: focusPinHour }),
                            });
                            await loadWeeklyFocus();
                          }
                          setShowFocusPinPicker(false);
                        }}
                        className="flex-1 rounded bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primaryDark"
                      >
                        Save
                      </button>
                      {(focusPinConfigured || weeklyFocus.postedAt) && (
                        <button
                          onClick={() => setShowFocusPinPicker(false)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setFocusTitle(weeklyFocus.title);
                      setFocusDescription(weeklyFocus.description || "");
                      setFocusVideoUrl(weeklyFocus.videoUrl || "");
                      setFocusItemId(weeklyFocus.rankTestItemId || "");
                      setShowFocusForm(true);
                    }}
                    className="flex-1 rounded bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primaryDark"
                  >
                    Edit Focus
                  </button>
                  <button
                    onClick={handleClearFocus}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-400 text-center py-1 mb-2">No focus set</p>
                <button
                  onClick={() => {
                    resetFocusForm();
                    setShowFocusForm(true);
                  }}
                  className="w-full rounded bg-primary px-2 py-1.5 text-xs font-medium text-white hover:bg-primaryDark"
                >
                  Set Focus
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Focus This Week Modal */}
      {showFocusForm && (() => {
        const selectedStyle = styles.find((s) => s.id === focusStyleId);
        // Only show ranks that have at least one category with items
        const ranksWithItems = new Set(
          focusRankTests
            .filter((rt) => rt.categories.some((c) => c.items.length > 0))
            .map((rt) => rt.rank.id)
        );
        const ranksForStyle = (selectedStyle?.ranks?.slice().sort((a, b) => a.order - b.order) || [])
          .filter((rank) => ranksWithItems.has(rank.id));
        const rankTest = focusRankTests.find((rt) => rt.rank.id === focusRankId);
        const categories = rankTest?.categories || [];
        const selectedCategory = categories.find((c) => c.id === focusCategoryId);
        const items = selectedCategory?.items || [];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg max-h-[85vh] rounded-lg bg-white shadow-xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold">{weeklyFocus ? "Edit Focus" : "Set Weekly Focus"}</h3>
                <button onClick={resetFocusForm} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Step 1: Choose Style */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Style Curriculum</label>
                  <div className="flex flex-wrap gap-2">
                    {styles.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => handleFocusSelectStyle(style.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          focusStyleId === style.id
                            ? "bg-primary text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {style.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2: Choose Rank */}
                {focusStyleId && ranksForStyle.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Rank</label>
                    <div className="flex flex-wrap gap-2">
                      {ranksForStyle.map((rank) => (
                        <button
                          key={rank.id}
                          onClick={() => handleFocusSelectRank(rank.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            focusRankId === rank.id
                              ? "bg-primary text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          {rank.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 3: Choose Category */}
                {focusRankId && categories.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Category</label>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => handleFocusSelectCategory(cat.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            focusCategoryId === cat.id
                              ? "bg-primary text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 4: Choose Item */}
                {focusCategoryId && items.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Technique / Item</label>
                    <select
                      value={focusItemId}
                      onChange={(e) => handleFocusSelectItem(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="">-- Select an item --</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {focusCategoryId && items.length === 0 && (
                  <p className="text-xs text-gray-400">No items in this category.</p>
                )}

                <hr className="border-gray-200" />

                {/* Title */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={focusTitle}
                    onChange={(e) => setFocusTitle(e.target.value)}
                    placeholder="Technique or concept name"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={focusDescription}
                    onChange={(e) => setFocusDescription(e.target.value)}
                    placeholder="What should students focus on this week?"
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                  />
                </div>

                {/* Video URL */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Video Link (optional)</label>
                  <input
                    type="url"
                    value={focusVideoUrl}
                    onChange={(e) => setFocusVideoUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>
              <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
                <button
                  onClick={resetFocusForm}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveFocus}
                  disabled={!focusTitle.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {weeklyFocus ? "Update Focus" : "Set Focus"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Channel Modal (Add/Edit) */}
      {showChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg max-h-[85vh] rounded-lg bg-white shadow-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {editingChannel ? "Edit Channel" : "Create New Channel"}
              </h3>
              <button
                onClick={() => { setShowChannelModal(false); resetChannelForm(); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Channel Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Channel Name
                </label>
                <input
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="e.g., Competition Team, Parents, Black Belts"
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              {/* Channel Description */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={channelDescription}
                  onChange={(e) => setChannelDescription(e.target.value)}
                  placeholder="Brief description of this channel"
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              {/* Visibility Options */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Who can view this channel?
                </label>
                <div className="space-y-2">
                  {[
                    { value: "all", label: "All Members", description: "Everyone in the dojo can see this channel" },
                    { value: "styles", label: "By Style", description: "Only members enrolled in specific styles" },
                    { value: "ranks", label: "By Rank", description: "Only members at or above specific ranks" },
                    { value: "statuses", label: "By Status", description: "Only members with specific statuses" },
                    { value: "specific", label: "Specific Members", description: "Hand-pick individual members" },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        channelVisibility === option.value
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        value={option.value}
                        checked={channelVisibility === option.value}
                        onChange={(e) => setChannelVisibility(e.target.value as typeof channelVisibility)}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{option.label}</div>
                        <div className="text-xs text-gray-500">{option.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Style Selection */}
              {channelVisibility === "styles" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Select Styles
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2">
                    {styles.length === 0 ? (
                      <p className="text-sm text-gray-500 p-2">No styles found</p>
                    ) : (
                      styles.map((style) => (
                        <label
                          key={style.id}
                          className={`flex items-center gap-2 p-2 rounded-md cursor-pointer ${
                            selectedStyleIds.includes(style.id) ? "bg-primary/10" : "hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedStyleIds.includes(style.id)}
                            onChange={() => toggleStyleSelection(style.id)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">{style.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Rank Selection */}
              {channelVisibility === "ranks" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Select Minimum Ranks (by Style)
                  </label>
                  <div className="space-y-3 max-h-60 overflow-y-auto border border-gray-200 rounded-md p-2">
                    {styles.length === 0 ? (
                      <p className="text-sm text-gray-500 p-2">No styles found</p>
                    ) : (
                      styles.map((style) => (
                        <div key={style.id}>
                          <div className="text-xs font-semibold text-gray-600 mb-1">{style.name}</div>
                          <div className="flex flex-wrap gap-1">
                            {style.ranks && style.ranks.length > 0 ? (
                              style.ranks.map((rank) => (
                                <button
                                  key={rank.id}
                                  type="button"
                                  onClick={() => toggleRankSelection(rank.id)}
                                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                                    selectedRankIds.includes(rank.id)
                                      ? "bg-primary text-white border-primary"
                                      : "border-gray-300 text-gray-700 hover:border-primary"
                                  }`}
                                >
                                  {rank.name}
                                </button>
                              ))
                            ) : (
                              <span className="text-xs text-gray-400">No ranks defined</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Status Selection */}
              {channelVisibility === "statuses" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Select Member Statuses
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {MEMBER_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => toggleStatusSelection(status)}
                        className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                          selectedStatuses.includes(status)
                            ? "bg-primary text-white border-primary"
                            : "border-gray-300 text-gray-700 hover:border-primary"
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Specific Member Selection */}
              {channelVisibility === "specific" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Select Members ({selectedMemberIds.length} selected)
                  </label>
                  <div className="space-y-1 max-h-60 overflow-y-auto border border-gray-200 rounded-md p-2">
                    {members.length === 0 ? (
                      <p className="text-sm text-gray-500 p-2">No members found</p>
                    ) : (
                      members.map((member) => (
                        <label
                          key={member.id}
                          className={`flex items-center gap-2 p-2 rounded-md cursor-pointer ${
                            selectedMemberIds.includes(member.id) ? "bg-primary/10" : "hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedMemberIds.includes(member.id)}
                            onChange={() => toggleMemberSelection(member.id)}
                            className="rounded border-gray-300"
                          />
                          <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                            {member.firstName[0]}{member.lastName[0]}
                          </div>
                          <span className="text-sm text-gray-700">
                            {member.firstName} {member.lastName}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            member.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                          }`}>
                            {member.status}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Delete button - only show when editing and not a default channel */}
                {editingChannel && editingChannel.id !== "all" && (
                  <button
                    onClick={() => handleDeleteChannel(editingChannel.id)}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                )}
                <div className="text-sm text-gray-500">
                  {channelVisibility === "all" && `${members.length} members will have access`}
                  {channelVisibility === "styles" && `${selectedStyleIds.length} style(s) selected`}
                  {channelVisibility === "ranks" && `${selectedRankIds.length} rank(s) selected`}
                  {channelVisibility === "statuses" && `${selectedStatuses.length} status(es) selected`}
                  {channelVisibility === "specific" && `${selectedMemberIds.length} member(s) selected`}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveChannel}
                  disabled={!channelName.trim()}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {editingChannel ? "Save Changes" : "Create Channel"}
                </button>
                <button
                  onClick={() => { setShowChannelModal(false); resetChannelForm(); }}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Member List Modal */}
      {showMemberList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md max-h-[80vh] rounded-lg bg-white shadow-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Channel Members</h3>
              <button
                onClick={() => setShowMemberList(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {members.length === 0 ? (
                <p className="text-center text-gray-500 text-sm">No members found</p>
              ) : (
                <div className="space-y-2">
                  {members.slice(0, 20).map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                        {member.firstName[0]}{member.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {member.firstName} {member.lastName}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {member.primaryStyle || member.rank || "Student"}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        member.status === "ACTIVE"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {member.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Conversation Modal */}
      {dmShowNewConversation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md max-h-[80vh] rounded-lg bg-white shadow-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">New Message</h3>
              <button
                onClick={() => { setDmShowNewConversation(false); setDmSearchQuery(""); setDmSelectedMemberIds([]); setDmNewMembersVisible(true); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Selected members chips */}
            {dmSelectedMemberIds.length > 0 && (
              <div className="px-4 pt-3 flex flex-wrap gap-1">
                {dmSelectedMemberIds.map(mid => {
                  const m = members.find(mm => mm.id === mid);
                  if (!m) return null;
                  return (
                    <span key={mid} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full">
                      {m.firstName} {m.lastName}
                      <button onClick={() => setDmSelectedMemberIds(prev => prev.filter(x => x !== mid))} className="hover:text-primaryDark">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="px-4 pt-3">
              <input
                type="text"
                value={dmSearchQuery}
                onChange={(e) => setDmSearchQuery(e.target.value)}
                placeholder="Search members..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>

            {/* Group options */}
            {dmSelectedMemberIds.length > 1 && (
              <div className="px-4 pt-2">
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dmNewMembersVisible}
                    onChange={(e) => setDmNewMembersVisible(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  Members can see each other
                </label>
                <p className="text-[10px] text-gray-400 mt-0.5 ml-5">Minors&apos; parents will be added automatically</p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {members
                .filter((m) => {
                  const q = dmSearchQuery.toLowerCase();
                  return !q || `${m.firstName} ${m.lastName}`.toLowerCase().includes(q);
                })
                .slice(0, 30)
                .map((member) => {
                  const isSelected = dmSelectedMemberIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      onClick={() => {
                        setDmSelectedMemberIds(prev =>
                          isSelected ? prev.filter(x => x !== member.id) : [...prev, member.id]
                        );
                      }}
                      className={`w-full flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 text-left ${isSelected ? "bg-primary/5" : ""}`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                        isSelected ? "bg-primary border-primary" : "border-gray-300"
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                        {member.firstName[0]}{member.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {member.firstName} {member.lastName}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {member.primaryStyle || member.rank || "Student"}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        member.status === "ACTIVE"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {member.status}
                      </span>
                    </button>
                  );
                })}
            </div>

            {/* First message compose + send */}
            {dmSelectedMemberIds.length > 0 && (
              <div className="p-4 border-t border-gray-200">
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="dm-new-conv-message"
                    placeholder="Type your first message..."
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        const input = e.target as HTMLInputElement;
                        if (input.value.trim()) createConversationAndSend(input.value);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById("dm-new-conv-message") as HTMLInputElement;
                      if (input?.value.trim()) createConversationAndSend(input.value);
                    }}
                    className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primaryDark transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
  );
}

// Bulletin Card Component
function BulletinCard({
  bulletin,
  onReaction,
  onDelete,
  formatTimeAgo,
  formatFileSize,
  getBulletinIcon,
  reactionLabels
}: {
  bulletin: Bulletin;
  onReaction: (id: string, type: string) => void;
  onDelete: (id: string) => void;
  formatTimeAgo: (date: Date) => string;
  formatFileSize: (bytes: number) => string;
  getBulletinIcon: (type: Bulletin["type"]) => React.ReactNode;
  reactionLabels: Record<string, { emoji: string; label: string }>;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const [newReply, setNewReply] = useState("");
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const typeStyles: Record<Bulletin["type"], string> = {
    testing: "border-l-4 border-amber-400 bg-amber-50/50",
    technique: "border-l-4 border-blue-400 bg-blue-50/50",
    achievement: "border-l-4 border-green-400 bg-green-50/50",
    schedule: "border-l-4 border-primary bg-primary/5",
    notice: "",
  };

  const typeLabels: Record<Bulletin["type"], { text: string; color: string } | null> = {
    testing: { text: "Belt Testing", color: "text-amber-700 bg-amber-100" },
    technique: { text: "Technique", color: "text-blue-700 bg-blue-100" },
    achievement: { text: "Achievement", color: "text-green-700 bg-green-100" },
    schedule: { text: "Schedule", color: "text-primary bg-primary/10" },
    notice: null,
  };

  const availableReactions = Object.entries(reactionLabels);

  return (
    <div className={`rounded-lg border border-gray-200 bg-white overflow-hidden ${typeStyles[bulletin.type]}`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold shrink-0 ${
            bulletin.type === "testing" ? "bg-amber-100 text-amber-700" :
            bulletin.type === "technique" ? "bg-blue-100 text-blue-700" :
            bulletin.type === "achievement" ? "bg-green-100 text-green-700" :
            bulletin.type === "schedule" ? "bg-primary/10 text-primary" :
            "bg-primary text-white"
          }`}>
            {getBulletinIcon(bulletin.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{bulletin.author}</span>
              {typeLabels[bulletin.type] && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeLabels[bulletin.type]!.color}`}>
                  {typeLabels[bulletin.type]!.text}
                </span>
              )}
              {bulletin.isPriority && (
                <span className="text-xs text-amber-600 flex items-center gap-0.5">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Priority
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">{formatTimeAgo(bulletin.timestamp)}</p>
          </div>
          {/* Delete button */}
          <button
            onClick={() => onDelete(bulletin.id)}
            className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-md transition-colors"
            title="Delete post"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {/* Title & Content */}
        <h4 className="font-semibold text-gray-900 mb-2">{bulletin.title}</h4>
        <p className="text-sm text-gray-700 whitespace-pre-wrap"><LinkedText text={bulletin.content || ""} /></p>

        {/* Attachments */}
        {bulletin.attachments && bulletin.attachments.length > 0 && (
          <div className="mt-3 space-y-2">
            {bulletin.attachments.map((file) => (
              <div key={file.id} className="rounded-lg border border-gray-200 overflow-hidden">
                {/* Image preview */}
                {file.type.startsWith("image/") && (
                  <div className="bg-gray-100">
                    <img
                      src={file.url}
                      alt={file.name}
                      className="max-h-64 w-auto mx-auto object-contain"
                    />
                  </div>
                )}
                {/* Video preview */}
                {file.type.startsWith("video/") && (
                  <div className="bg-black">
                    <video
                      src={file.url}
                      controls
                      className="max-h-64 w-full"
                    />
                  </div>
                )}
                {/* File info bar */}
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                  {file.type.startsWith("image/") ? (
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ) : file.type.includes("pdf") ? (
                    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  ) : file.type.startsWith("video/") ? (
                    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  <span className="text-xs font-medium text-gray-700 flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-gray-400">{formatFileSize(file.size)}</span>
                  <a
                    href={file.url}
                    download={file.name}
                    className="p-1 text-gray-400 hover:text-primary rounded transition-colors"
                    title="Download"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Style Tags */}
        {bulletin.styleTags && bulletin.styleTags.length > 0 && (
          <div className="mt-3 flex gap-1.5 flex-wrap">
            {bulletin.styleTags.map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Reactions */}
        {bulletin.reactions.length > 0 && (
          <div className="mt-3 flex gap-2 flex-wrap">
            {bulletin.reactions.map((reaction) => (
              <button
                key={reaction.type}
                onClick={() => onReaction(bulletin.id, reaction.type)}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-sm transition-colors"
              >
                <span>{reactionLabels[reaction.type]?.emoji || "👍"}</span>
                <span className="text-xs font-medium text-gray-700">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            className="flex items-center gap-1.5 text-gray-500 hover:text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium">React</span>
          </button>
          {showReactionPicker && (
            <div className="absolute bottom-full left-0 mb-2 p-2 bg-white rounded-lg shadow-lg border border-gray-200 flex gap-1">
              {availableReactions.map(([key, { emoji, label }]) => (
                <button
                  key={key}
                  onClick={() => { onReaction(bulletin.id, key); setShowReactionPicker(false); }}
                  className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                  title={label}
                >
                  <span className="text-lg">{emoji}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowReplies(!showReplies)}
          className="flex items-center gap-1.5 text-gray-500 hover:text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          <span className="text-xs font-medium">{bulletin.replies.length} {bulletin.replies.length === 1 ? "Reply" : "Replies"}</span>
        </button>
      </div>

      {/* Replies */}
      {showReplies && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
          {bulletin.replies.length > 0 && (
            <div className="space-y-3 mb-3">
              {bulletin.replies.map((reply) => (
                <div key={reply.id} className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
                    {reply.authorInitials}
                  </div>
                  <div className="flex-1 bg-white rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-900">{reply.author}</span>
                      <span className="text-xs text-gray-400">{formatTimeAgo(reply.timestamp)}</span>
                    </div>
                    <p className="text-xs text-gray-700"><LinkedText text={reply.content || ""} /></p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              placeholder="Write a reply..."
              className="flex-1 rounded-full border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-full hover:bg-primaryDark disabled:opacity-50">
              Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
