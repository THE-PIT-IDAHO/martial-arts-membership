-- Per-item wholesale cost so reports can derive gross margin on
-- goods (revenue - cost). Nullable + no default -- existing items
-- without a recorded cost show as "-" in margin columns rather than
-- being counted as $0 cost (which would show inflated profit).
ALTER TABLE "POSItem" ADD COLUMN "costCents" INTEGER;
