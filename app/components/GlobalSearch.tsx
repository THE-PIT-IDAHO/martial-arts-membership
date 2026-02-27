"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  memberNumber: number | null;
  primaryStyle: string | null;
  status: string;
};

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut: Ctrl+K or Cmd+K to focus search
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Search members when query changes
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const searchMembers = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/members?search=${encodeURIComponent(query)}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.members || []);
          setIsOpen(true);
        }
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchMembers, 200);
    return () => clearTimeout(debounce);
  }, [query]);

  const handleSelectMember = (member: Member) => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    router.push(`/members/${member.id}`);
  };

  // Priority order for statuses (higher index = higher priority)
  const STATUS_PRIORITY: Record<string, number> = {
    "PROSPECT": 1,
    "ACTIVE": 2,
    "INACTIVE": 3,
    "PARENT": 4,
    "CANCELLED": 5,
    "CANCELED": 5,
    "BANNED": 6,
    "COACH": 7,
  };

  // Get the highest priority status from a comma-separated string
  const getPriorityStatus = (statusString: string): string => {
    if (!statusString) return "";

    // Split by comma and trim whitespace
    const statuses = statusString.split(",").map(s => s.trim().toUpperCase());

    // If only one status, return it
    if (statuses.length === 1) {
      return statuses[0];
    }

    // Find the highest priority status
    let highestPriority = 0;
    let priorityStatus = statuses[0];

    for (const status of statuses) {
      const priority = STATUS_PRIORITY[status] || 0;
      if (priority > highestPriority) {
        highestPriority = priority;
        priorityStatus = status;
      }
    }

    return priorityStatus;
  };

  const getStatusColor = (status: string) => {
    const priorityStatus = getPriorityStatus(status);
    switch (priorityStatus) {
      case "COACH":
        return "bg-purple-100 text-purple-800";
      case "ACTIVE":
        return "bg-green-100 text-green-800";
      case "INACTIVE":
        return "bg-gray-100 text-gray-800";
      case "CANCELLED":
      case "CANCELED":
        return "bg-red-100 text-red-800";
      case "BANNED":
        return "bg-red-100 text-red-800";
      case "PROSPECT":
        return "bg-blue-100 text-blue-800";
      case "PARENT":
        return "bg-amber-100 text-amber-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Format status for display - show only the priority status
  const formatStatus = (status: string) => {
    if (!status) return "";
    const priorityStatus = getPriorityStatus(status);
    // Capitalize first letter
    return priorityStatus.charAt(0).toUpperCase() + priorityStatus.slice(1).toLowerCase();
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-96">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && results.length > 0 && setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isOpen && results.length > 0) {
              e.preventDefault();
              handleSelectMember(results[0]);
            }
          }}
          placeholder="Search members... (Ctrl+K)"
          className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-[100]">
          <div className="max-h-80 overflow-y-auto">
            {results.map((member, idx) => (
              <button
                key={member.id}
                onClick={() => handleSelectMember(member)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 last:border-b-0 transition-colors ${idx === 0 ? "bg-gray-50" : ""}`}
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                  {member.firstName[0]}{member.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {member.firstName} {member.lastName}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {member.memberNumber && `#${member.memberNumber}`}
                    {member.memberNumber && member.primaryStyle && " • "}
                    {member.primaryStyle}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(member.status)}`}>
                  {formatStatus(member.status)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {isOpen && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-4 text-center text-gray-500 text-sm z-[100]">
          No members found for "{query}"
        </div>
      )}
    </div>
  );
}
