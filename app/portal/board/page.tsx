"use client";

import { useEffect, useState, useRef } from "react";

interface BoardReply {
  id: string;
  content: string;
  authorId: string | null;
  authorName: string;
  authorInitials: string;
  createdAt: string;
}

interface BoardFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

interface BoardPost {
  id: string;
  type: string;
  title: string;
  content: string;
  authorId: string | null;
  authorName: string;
  authorInitials: string;
  isPriority: boolean;
  createdAt: string;
  files: BoardFile[];
  replies: BoardReply[];
  channel: { id: string; name: string } | null;
}

interface PollOption {
  id: string;
  text: string;
  order: number;
  votes: { id: string; voterId: string }[];
}

interface BoardPoll {
  id: string;
  question: string;
  authorName: string;
  authorInitials: string;
  allowMultiple: boolean;
  expiresAt: string | null;
  createdAt: string;
  options: PollOption[];
  channel: { id: string; name: string } | null;
}

interface BoardChannel {
  id: string;
  name: string;
  description: string | null;
  _count: { posts: number; polls: number };
}

type FeedItem =
  | { kind: "post"; data: BoardPost; sortDate: string }
  | { kind: "poll"; data: BoardPoll; sortDate: string };

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function renderTextWithLinks(text: string) {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function PortalBoardPage() {
  const [channels, setChannels] = useState<BoardChannel[]>([]);
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [polls, setPolls] = useState<BoardPoll[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // New post form
  const [showNewPost, setShowNewPost] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newChannelId, setNewChannelId] = useState("");
  const [posting, setPosting] = useState(false);

  // Reply state per post
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const replyInputRef = useRef<HTMLInputElement>(null);

  // Expanded posts (to show replies)
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());

  // Polls in "change vote" mode
  const [editingPolls, setEditingPolls] = useState<Set<string>>(new Set());

  // Current member ID for poll votes
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal/auth/me")
      .then((r) => r.json())
      .then((data) => { if (data.id) setMemberId(data.id); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadChannels();
  }, []);

  useEffect(() => {
    if (selectedChannel) loadContent();
  }, [selectedChannel]);

  async function loadChannels() {
    try {
      const res = await fetch("/api/portal/board/channels");
      if (res.ok) {
        const data = await res.json();
        const chs = data.channels || [];
        setChannels(chs);
        // Auto-select the first channel
        if (chs.length > 0 && !selectedChannel) {
          setSelectedChannel(chs[0].id);
        }
      }
    } catch { /* ignore */ }
  }

  async function loadContent() {
    setLoading(true);
    try {
      const channelParam = selectedChannel ? `?channelId=${selectedChannel}` : "";
      const [postsRes, pollsRes] = await Promise.all([
        fetch(`/api/portal/board/posts${channelParam}`),
        fetch(`/api/board/polls${channelParam}`),
      ]);

      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(data.posts || []);
      }
      if (pollsRes.ok) {
        const data = await pollsRes.json();
        setPolls(data.polls || []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  async function handleCreatePost() {
    if (!newTitle.trim() || !newChannelId) return;
    setPosting(true);
    try {
      const res = await fetch("/api/portal/board/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          content: newContent,
          channelId: newChannelId,
        }),
      });
      if (res.ok) {
        setNewTitle("");
        setNewContent("");
        setShowNewPost(false);
        loadContent();
      }
    } catch { /* ignore */ } finally {
      setPosting(false);
    }
  }

  async function handleReply(postId: string) {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch("/api/portal/board/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, content: replyText }),
      });
      if (res.ok) {
        setReplyText("");
        setReplyingTo(null);
        loadContent();
        setExpandedPosts((prev) => new Set(prev).add(postId));
      }
    } catch { /* ignore */ } finally {
      setSendingReply(false);
    }
  }

  async function handleVote(pollId: string, optionId: string) {
    try {
      const res = await fetch(`/api/portal/board/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      if (res.ok) {
        const data = await res.json();
        setPolls((prev) => prev.map((p) => (p.id === pollId ? data.poll : p)));
        setEditingPolls((prev) => { const next = new Set(prev); next.delete(pollId); return next; });
      }
    } catch { /* ignore */ }
  }

  function toggleExpanded(postId: string) {
    setExpandedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  // Merge posts and polls into a single feed sorted by date
  const feed: FeedItem[] = [
    ...posts.map((p) => ({ kind: "post" as const, data: p, sortDate: p.createdAt })),
    ...polls.map((p) => ({ kind: "poll" as const, data: p, sortDate: p.createdAt })),
  ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());

  // Priority posts first
  const priorityItems = feed.filter((f) => f.kind === "post" && f.data.isPriority);
  const normalItems = feed.filter((f) => !(f.kind === "post" && f.data.isPriority));
  const sortedFeed = [...priorityItems, ...normalItems];

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Dojo Board</h1>
        <button
          onClick={() => {
            setShowNewPost(!showNewPost);
            if (!newChannelId) setNewChannelId(selectedChannel || (channels.length > 0 ? channels[0].id : ""));
          }}
          className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold active:scale-[0.98] transition-transform"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Post
        </button>
      </div>

      {/* Channel filter pills */}
      {channels.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4 scrollbar-hide">
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setSelectedChannel(ch.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedChannel === ch.id
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-600 active:bg-gray-200"
              }`}
            >
              {ch.name}
            </button>
          ))}
        </div>
      )}

      {/* New post form */}
      {showNewPost && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-gray-900">New Post</h3>

          {channels.length > 1 && (
            <select
              value={newChannelId}
              onChange={(e) => setNewChannelId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>{ch.name}</option>
              ))}
            </select>
          )}

          <input
            type="text"
            placeholder="Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          <textarea
            placeholder="What's on your mind? (optional)"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowNewPost(false)}
              className="px-4 py-2 text-sm text-gray-600 rounded-lg active:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleCreatePost}
              disabled={!newTitle.trim() || !newChannelId || posting}
              className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {posting ? "Posting..." : "Post"}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-gray-500 text-sm">Loading...</div>
      )}

      {/* Empty state */}
      {!loading && sortedFeed.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">No posts yet</p>
          <p className="text-gray-400 text-xs mt-1">Be the first to start a discussion!</p>
        </div>
      )}

      {/* Feed */}
      {!loading && (
        <div className="space-y-3">
          {sortedFeed.map((item) => {
            if (item.kind === "post") {
              const post = item.data;
              const isExpanded = expandedPosts.has(post.id);
              const replyCount = post.replies.length;

              return (
                <div
                  key={`post-${post.id}`}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                    post.isPriority ? "border-primary/30 ring-1 ring-primary/10" : "border-gray-200"
                  }`}
                >
                  {/* Post header */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-gray-600">{post.authorInitials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">{post.authorName}</span>
                          {post.isPriority && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                              PINNED
                            </span>
                          )}
                          {post.channel && (
                            <span className="text-[10px] text-gray-400 font-medium">
                              in {post.channel.name}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(post.createdAt)}</p>
                      </div>
                    </div>

                    {/* Post content */}
                    <div className="mt-3">
                      <h3 className="font-semibold text-gray-900">{post.title}</h3>
                      {post.content && (
                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{renderTextWithLinks(post.content)}</p>
                      )}
                    </div>

                    {/* Files / media */}
                    {post.files.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {post.files.map((file) => (
                          <div key={file.id} className="rounded-lg border border-gray-200 overflow-hidden">
                            {/* Inline image */}
                            {file.type.startsWith("image/") && (
                              <div className="bg-gray-100">
                                <img
                                  src={file.url}
                                  alt={file.name}
                                  className="max-h-64 w-auto mx-auto object-contain"
                                />
                              </div>
                            )}

                            {/* Inline video */}
                            {file.type.startsWith("video/") && (
                              <div className="bg-black">
                                <video
                                  src={file.url}
                                  controls
                                  playsInline
                                  className="max-h-64 w-full"
                                />
                              </div>
                            )}

                            {/* File info bar */}
                            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                              {file.type.startsWith("image/") ? (
                                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M2.25 18V6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25h-15A2.25 2.25 0 012.25 18z" />
                                </svg>
                              ) : file.type.startsWith("video/") ? (
                                <svg className="w-4 h-4 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                                </svg>
                              )}
                              <span className="text-xs font-medium text-gray-700 flex-1 truncate">{file.name}</span>
                              <a
                                href={file.url}
                                download={file.name}
                                className="text-gray-400 active:text-gray-600"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions bar */}
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => {
                          if (replyCount > 0) toggleExpanded(post.id);
                          setReplyingTo(replyingTo === post.id ? null : post.id);
                          setTimeout(() => replyInputRef.current?.focus(), 100);
                        }}
                        className="flex items-center gap-1.5 text-sm text-gray-500 active:text-gray-700"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
                        </svg>
                        {replyCount > 0 ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"}` : "Reply"}
                      </button>
                    </div>
                  </div>

                  {/* Replies */}
                  {isExpanded && replyCount > 0 && (
                    <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 space-y-3">
                      {post.replies.map((reply) => (
                        <div key={reply.id} className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-semibold text-gray-500">{reply.authorInitials}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-700">{reply.authorName}</span>
                              <span className="text-[10px] text-gray-400">{timeAgo(reply.createdAt)}</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{renderTextWithLinks(reply.content)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply input */}
                  {replyingTo === post.id && (
                    <div className="bg-gray-50 border-t border-gray-100 px-4 py-3">
                      <div className="flex gap-2">
                        <input
                          ref={replyInputRef}
                          type="text"
                          placeholder="Write a reply..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleReply(post.id);
                            }
                          }}
                          className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <button
                          onClick={() => handleReply(post.id)}
                          disabled={!replyText.trim() || sendingReply}
                          className="shrink-0 w-9 h-9 flex items-center justify-center bg-primary text-white rounded-full disabled:opacity-50 active:scale-[0.95] transition-transform"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // Poll
            const poll = item.data;
            const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);
            const hasVoted = memberId
              ? poll.options.some((o) => o.votes.some((v) => v.voterId === memberId))
              : false;
            const isExpired = poll.expiresAt && new Date(poll.expiresAt) < new Date();
            const isEditing = editingPolls.has(poll.id);
            const showResults = (hasVoted && !isEditing) || isExpired;

            return (
              <div
                key={`poll-${poll.id}`}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{poll.authorName}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-600">
                        POLL
                      </span>
                      {poll.channel && (
                        <span className="text-[10px] text-gray-400 font-medium">
                          in {poll.channel.name}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(poll.createdAt)}</p>
                  </div>
                </div>

                <h3 className="font-semibold text-gray-900 mt-3">{poll.question}</h3>

                {isExpired && (
                  <p className="text-xs text-red-500 mt-1">This poll has ended</p>
                )}

                <div className="mt-3 space-y-2">
                  {poll.options.map((opt) => {
                    const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                    const isMyVote = memberId ? opt.votes.some((v) => v.voterId === memberId) : false;

                    if (showResults) {
                      // Show results with highlight on member's vote
                      return (
                        <div
                          key={opt.id}
                          className={`relative rounded-lg overflow-hidden ${
                            isMyVote
                              ? "ring-2 ring-primary border border-primary"
                              : "border border-gray-200"
                          }`}
                        >
                          <div
                            className={`absolute inset-0 ${isMyVote ? "bg-primary/15" : "bg-gray-100"}`}
                            style={{ width: `${pct}%` }}
                          />
                          <div className="relative flex items-center justify-between px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {isMyVote && (
                                <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                </span>
                              )}
                              <span className={`text-sm ${isMyVote ? "font-semibold text-primary" : "text-gray-700"}`}>
                                {opt.text}
                              </span>
                            </div>
                            <span className={`text-xs font-medium ml-2 ${isMyVote ? "text-primary" : "text-gray-500"}`}>{pct}%</span>
                          </div>
                        </div>
                      );
                    }

                    // Show vote buttons (not yet voted)
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleVote(poll.id, opt.id)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 active:bg-primary/5 active:border-primary/30 transition-colors"
                      >
                        {opt.text}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-400">
                    {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
                    {poll.allowMultiple && " \u00b7 Multiple choice"}
                  </p>
                  {hasVoted && !isExpired && (
                    <button
                      onClick={() =>
                        setEditingPolls((prev) => {
                          const next = new Set(prev);
                          if (next.has(poll.id)) next.delete(poll.id);
                          else next.add(poll.id);
                          return next;
                        })
                      }
                      className="text-xs font-medium text-primary active:text-primaryDark"
                    >
                      {isEditing ? "Cancel" : "Change vote"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
