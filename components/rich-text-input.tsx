"use client";

import React, { useRef, useEffect, useCallback } from "react";

interface RichTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}

/**
 * A simple rich text input that supports Ctrl+B for bold formatting.
 * Stores and returns HTML content with <b> tags for bold text.
 */
export function RichTextInput({
  value,
  onChange,
  placeholder,
  className = "",
  rows = 3,
}: RichTextInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);

  // Sync external value changes to the editor
  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      // Only update if the content is different to preserve cursor position
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || "";
      }
    }
    isInternalUpdate.current = false;
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalUpdate.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Ctrl+B or Cmd+B for bold
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      document.execCommand("bold", false);
      handleInput();
    }
  }, [handleInput]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Get plain text from clipboard and paste it
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    handleInput();
  }, [handleInput]);

  // Calculate min-height based on rows
  const minHeight = rows * 1.5 + 0.5; // Approximate line height + padding

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={`${className} outline-none overflow-y-auto`}
        style={{ minHeight: `${minHeight}em` }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
      {/* Show placeholder when empty */}
      <style jsx>{`
        div[contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

/**
 * Utility function to strip HTML tags and return plain text
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

/**
 * Parse HTML content for PDF rendering
 * Returns an array of segments with text and whether it's bold
 */
export function parseHtmlForPdf(html: string): Array<{ text: string; bold: boolean }> {
  if (!html) return [];

  const segments: Array<{ text: string; bold: boolean }> = [];
  const tmp = document.createElement("div");
  tmp.innerHTML = html;

  function processNode(node: Node, isBold: boolean) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (text) {
        segments.push({ text, bold: isBold });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();
      const isThisBold = isBold || tagName === "b" || tagName === "strong";

      // Handle <br> as newline
      if (tagName === "br") {
        segments.push({ text: "\n", bold: false });
        return;
      }

      // Handle block elements as newlines
      if (tagName === "div" || tagName === "p") {
        if (segments.length > 0 && !segments[segments.length - 1].text.endsWith("\n")) {
          segments.push({ text: "\n", bold: false });
        }
      }

      for (const child of Array.from(node.childNodes)) {
        processNode(child, isThisBold);
      }

      // Add newline after block elements
      if ((tagName === "div" || tagName === "p") && segments.length > 0) {
        if (!segments[segments.length - 1].text.endsWith("\n")) {
          segments.push({ text: "\n", bold: false });
        }
      }
    }
  }

  processNode(tmp, false);

  // Merge consecutive segments with the same bold state
  const merged: Array<{ text: string; bold: boolean }> = [];
  for (const seg of segments) {
    if (merged.length > 0 && merged[merged.length - 1].bold === seg.bold) {
      merged[merged.length - 1].text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}
