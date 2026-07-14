import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { getGymTimezone, getDayOfWeekInTimezone, localMidnightUtc, formatDateInTimezone, getLocalParts } from "@/lib/dates";
import { getStyleProgress, attendanceCountsForStyle, type AttendanceRow } from "@/lib/rank-progress";

// GET /api/dashboard
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const now = new Date();
    // "Today" is defined in the gym's timezone, not the server's. On Vercel
    // the server is UTC, so without this evening hours in any negative-UTC
    // timezone would roll the dashboard onto tomorrow prematurely.
    const tz = await getGymTimezone(clientId);
    const todayLocalYmd = formatDateInTimezone(now, tz);
    const todayStartMs = localMidnightUtc(todayLocalYmd, tz);
    const todayStart = new Date(todayStartMs);
    const todayEnd = new Date(todayStartMs + 24 * 60 * 60 * 1000 - 1);

    const dayOfWeek = getDayOfWeekInTimezone(now, tz); // 0=Sun, 1=Mon, ...

    // --- Members ---
    // Status is a comma-separated string (e.g. "ACTIVE,COACH"), so we have to
    // use contains-based filters. For "ACTIVE" specifically, exclude rows that
    // also contain "INACTIVE" since the substring would match both.
    const totalMembers = await prisma.member.count({ where: { clientId } });
    const activeMembers = await prisma.member.count({
      where: {
        clientId,
        status: { contains: "ACTIVE" },
        NOT: { status: { contains: "INACTIVE" } },
      },
    });
    const prospectMembers = await prisma.member.count({
      where: { clientId, status: { contains: "PROSPECT" } },
    });

    // Recently added members (last 7 days)
    const weekAgo = new Date(todayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentMembers = await prisma.member.findMany({
      where: { createdAt: { gte: weekAgo }, clientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // --- Today's Classes ---
    // Get all class sessions and filter for ones that occur today
    const allClasses = await prisma.classSession.findMany({
      where: { clientId },
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true,
        classType: true,
        classTypes: true,
        styleId: true,
        styleIds: true,
        styleName: true,
        styleNames: true,
        minRankId: true,
        minRankName: true,
        minRankIds: true,
        minAge: true,
        maxAge: true,
        isRecurring: true,
        frequencyNumber: true,
        frequencyUnit: true,
        scheduleStartDate: true,
        scheduleEndDate: true,
        isOngoing: true,
        excludedDates: true,
        color: true,
        coachName: true,
        _count: {
          select: {
            attendances: {
              where: {
                attendanceDate: {
                  gte: todayStart,
                  lte: todayEnd,
                },
              },
            },
          },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    // Filter classes that happen today (matching calendar page logic)
    const todaysClasses = allClasses.filter((cls) => {
      const classStart = new Date(cls.startsAt);

      // Non-recurring: check if the exact date matches today
      if (!cls.isRecurring) {
        return (
          classStart >= todayStart && classStart <= todayEnd
        );
      }

      // Recurring: check if today falls within the schedule
      const scheduleStart = cls.scheduleStartDate
        ? new Date(cls.scheduleStartDate)
        : null;
      const scheduleEnd = cls.scheduleEndDate
        ? new Date(cls.scheduleEndDate)
        : null;

      if (scheduleStart && todayStart < scheduleStart) return false;
      if (scheduleEnd && !cls.isOngoing && todayStart > scheduleEnd) return false;

      // Check excluded dates (compare in gym's local date, not server's)
      if (cls.excludedDates) {
        try {
          const excluded: string[] = JSON.parse(cls.excludedDates);
          if (excluded.includes(todayLocalYmd)) return false;
        } catch { /* ignore */ }
      }

      // Day of week must match (in gym TZ, not server TZ)
      const classDow = getDayOfWeekInTimezone(classStart, tz);
      if (classDow !== dayOfWeek) return false;

      const freq = cls.frequencyNumber || 1;

      // Weekly recurring: check interval
      if (cls.frequencyUnit === "Week") {
        if (freq === 1) return true;
        // Check if the right number of weeks have elapsed
        const refDate = scheduleStart || classStart;
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const weeksDiff = Math.floor((todayStart.getTime() - refDate.getTime()) / msPerWeek);
        return weeksDiff % freq === 0;
      }

      // Daily recurring
      if (cls.frequencyUnit === "Day") {
        if (freq === 1) return true;
        const refDate = scheduleStart || classStart;
        const msPerDay = 24 * 60 * 60 * 1000;
        const daysDiff = Math.floor((todayStart.getTime() - refDate.getTime()) / msPerDay);
        return daysDiff % freq === 0;
      }

      return false;
    });

    // Get today's attendance records per class for interactive features.
    // Scope by member.clientId so a stray row created against another
    // tenant's data (or a class that was moved between tenants in the
    // past) can never show on this dashboard.
    const todayAttendances = await prisma.attendance.findMany({
      where: {
        attendanceDate: { gte: todayStart, lte: todayEnd },
        classSessionId: { in: todaysClasses.map((c) => c.id) },
        member: { clientId },
      },
      select: {
        id: true,
        memberId: true,
        classSessionId: true,
        confirmed: true,
        checkedInAt: true,
        source: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { checkedInAt: "asc" },
    });

    // Group attendance by class
    const attendanceByClass: Record<string, typeof todayAttendances> = {};
    for (const att of todayAttendances) {
      if (att.classSessionId) {
        if (!attendanceByClass[att.classSessionId]) {
          attendanceByClass[att.classSessionId] = [];
        }
        attendanceByClass[att.classSessionId].push(att);
      }
    }

    // Format for response
    const classesToday = todaysClasses.map((cls) => ({
      id: cls.id,
      name: cls.name,
      startsAt: cls.startsAt,
      endsAt: cls.endsAt,
      styleName: cls.styleName || cls.styleNames,
      styleIds: cls.styleIds,
      styleId: cls.styleId,
      minRankId: cls.minRankId,
      minRankName: cls.minRankName,
      minRankIds: cls.minRankIds,
      minAge: cls.minAge,
      maxAge: cls.maxAge,
      classType: cls.classType || cls.classTypes,
      color: cls.color,
      coachName: cls.coachName,
      attendanceCount: cls._count.attendances,
      attendees: (attendanceByClass[cls.id] || []).map((a) => ({
        id: a.id,
        memberId: a.memberId,
        firstName: a.member.firstName,
        lastName: a.member.lastName,
        confirmed: a.confirmed,
        checkedInAt: a.checkedInAt,
        source: a.source,
      })),
    }));

    // Sort by time of day (not full datetime, since recurring classes have old dates)
    classesToday.sort((a, b) => {
      const aParts = getLocalParts(new Date(a.startsAt), tz);
      const bParts = getLocalParts(new Date(b.startsAt), tz);
      const aMins = aParts.hour * 60 + aParts.minute;
      const bMins = bParts.hour * 60 + bParts.minute;
      return aMins - bMins;
    });

    // --- Today's Attendance ---
    const todayAttendanceCount = await prisma.attendance.count({
      where: {
        attendanceDate: { gte: todayStart, lte: todayEnd },
        member: { clientId },
      },
    });

    const recentCheckins = await prisma.attendance.findMany({
      where: {
        attendanceDate: { gte: todayStart, lte: todayEnd },
        member: { clientId },
      },
      select: {
        id: true,
        checkedInAt: true,
        confirmed: true,
        source: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        classSession: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { checkedInAt: "desc" },
      take: 10,
    });

    // --- Tasks ---
    const openTasks = await prisma.task.findMany({
      where: { status: "OPEN", clientId },
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        recurrence: true,
        assignedRole: true,
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 8,
    });

    const overdueTasks = openTasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < todayStart
    ).length;

    // --- Today's Appointments ---
    const todaysAppointments = await prisma.scheduledAppointment.findMany({
      where: {
        scheduledDate: { gte: todayStart, lte: todayEnd },
        status: { not: "CANCELLED" },
        clientId,
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        memberName: true,
        coachName: true,
        status: true,
        appointment: {
          select: {
            title: true,
            color: true,
          },
        },
      },
      orderBy: { startTime: "asc" },
    });

    // --- Revenue ---
    // Today's POS revenue
    const todayTransactions = await prisma.pOSTransaction.findMany({
      where: {
        createdAt: { gte: todayStart, lte: todayEnd },
        status: "COMPLETED",
        clientId,
      },
      select: {
        totalCents: true,
        paymentMethod: true,
      },
    });
    const todayPosRevenue = todayTransactions.reduce((sum, t) => sum + t.totalCents, 0);

    // This month's POS revenue
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTransactions = await prisma.pOSTransaction.aggregate({
      where: {
        createdAt: { gte: monthStart, lte: todayEnd },
        status: "COMPLETED",
        clientId,
      },
      _sum: { totalCents: true },
      _count: true,
    });

    // Active memberships with recurring revenue
    const activeMemberships = await prisma.membership.findMany({
      where: { status: "ACTIVE", member: { clientId } },
      select: {
        customPriceCents: true,
        membershipPlan: {
          select: {
            priceCents: true,
            billingCycle: true,
          },
        },
      },
    });

    // Calculate monthly recurring revenue (MRR)
    let monthlyRecurringRevenue = 0;
    for (const ms of activeMemberships) {
      const price = ms.customPriceCents ?? ms.membershipPlan.priceCents ?? 0;
      switch (ms.membershipPlan.billingCycle) {
        case "WEEKLY": monthlyRecurringRevenue += price * 4; break;
        case "MONTHLY": monthlyRecurringRevenue += price; break;
        case "QUARTERLY": monthlyRecurringRevenue += Math.round(price / 3); break;
        case "SEMI_ANNUALLY": monthlyRecurringRevenue += Math.round(price / 6); break;
        case "YEARLY": monthlyRecurringRevenue += Math.round(price / 12); break;
        default: monthlyRecurringRevenue += price; break;
      }
    }

    // --- Expired non-recurring memberships ---
    // Only show memberships whose plan does NOT auto-renew and whose end date has passed
    const expiringMemberships = await prisma.membership.findMany({
      where: {
        status: "ACTIVE",
        endDate: { lt: todayStart },
        membershipPlan: { autoRenew: false },
        member: { clientId },
      },
      select: {
        id: true,
        endDate: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        membershipPlan: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { endDate: "asc" },
      take: 5,
    });

    // --- Expiring soon: non-recurring memberships ending in the next 30 days ---
    // Separate from the "Expired" box above — this one is the heads-up
    // window, so the admin can reach out before the membership actually
    // lapses. Same autoRenew=false filter (recurring plans auto-charge
    // on nextPaymentDate and don't count as "expiring").
    const thirtyDaysOut = new Date(todayStart);
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
    const expiringSoonMemberships = await prisma.membership.findMany({
      where: {
        status: "ACTIVE",
        endDate: { gte: todayStart, lte: thirtyDaysOut },
        membershipPlan: { autoRenew: false },
        member: { clientId },
      },
      select: {
        id: true,
        endDate: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        membershipPlan: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { endDate: "asc" },
    });

    // --- Billing ---
    const pastDueCount = await prisma.invoice.count({
      where: { status: "PAST_DUE", member: { clientId } },
    });

    const sevenDaysFromNow = new Date(todayEnd);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const upcomingBillings = await prisma.membership.findMany({
      where: {
        status: "ACTIVE",
        nextPaymentDate: {
          gte: todayStart,
          lte: sevenDaysFromNow,
        },
        member: { clientId },
      },
      select: {
        id: true,
        nextPaymentDate: true,
        customPriceCents: true,
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
        membershipPlan: {
          select: { name: true, priceCents: true, billingCycle: true },
        },
      },
      orderBy: { nextPaymentDate: "asc" },
      take: 10,
    });

    const pastDueInvoices = await prisma.invoice.findMany({
      where: { status: "PAST_DUE", member: { clientId } },
      select: {
        id: true,
        amountCents: true,
        dueDate: true,
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
        membership: {
          select: {
            membershipPlan: { select: { name: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    });

    // --- Promotion Eligibility ---
    const eligibleForPromotion: {
      memberId: string;
      memberName: string;
      styleName: string;
      currentRank: string;
      nextRank: string;
      requirementsMet: { label: string; count: number; required: number }[];
    }[] = [];

    try {
      // Get all styles with belt systems. Scope by clientId — without it
      // a style from another gym with a matching name could shadow this
      // gym's version and pull the wrong beltConfig.
      const stylesWithBelts = await prisma.style.findMany({
        where: { beltSystemEnabled: true, clientId },
        select: {
          id: true,
          name: true,
          beltConfig: true,
          ranks: {
            select: { name: true, order: true, classRequirement: true },
            orderBy: { order: "asc" },
          },
        },
      });

      if (stylesWithBelts.length > 0) {
        // Get active members with styles and attendance. Match the
        // status filter to /api/promotions/eligible so a member tagged
        // "ACTIVE,COACH" (comma-separated statuses) still gets picked
        // up here — exact-match "ACTIVE" was silently dropping those.
        const membersWithStyles = await prisma.member.findMany({
          where: {
            status: { contains: "ACTIVE" },
            NOT: { status: { contains: "INACTIVE" } },
            stylesNotes: { not: null },
            clientId,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            stylesNotes: true,
            attendances: {
              select: {
                attendanceDate: true,
                checkedInAt: true,
                source: true,
                classSession: {
                  select: {
                    classType: true,
                    classTypes: true,
                    styleName: true,
                    styleNames: true,
                  },
                },
              },
            },
          },
        });

        for (const member of membersWithStyles) {
          if (!member.stylesNotes) continue;
          let memberStyles: any[];
          try {
            memberStyles = JSON.parse(member.stylesNotes);
          } catch {
            continue;
          }

          for (const ms of memberStyles) {
            if (ms.active === false) continue;
            const styleConfig = stylesWithBelts.find(
              (st) => st.name.toLowerCase() === (ms.name || "").toLowerCase()
            );
            if (!styleConfig) continue;

            // Prefer beltConfig.ranks as the source of truth — that's where the
            // full granular progression lives (e.g. "White Belt - 1 stripe").
            // The Prisma Rank table often only carries the main belts.
            let sortedRanks: Array<{ name: string; order?: number; classRequirement?: number | null }> = styleConfig.ranks;
            if (styleConfig.beltConfig) {
              try {
                const bc = typeof styleConfig.beltConfig === "string"
                  ? JSON.parse(styleConfig.beltConfig)
                  : styleConfig.beltConfig;
                if (Array.isArray(bc.ranks) && bc.ranks.length > 0) {
                  sortedRanks = [...bc.ranks].sort(
                    (a: { order?: number }, b: { order?: number }) => (a.order ?? 0) - (b.order ?? 0)
                  );
                }
              } catch { /* ignore */ }
            }
            if (sortedRanks.length === 0) continue;

            const currentIdx = sortedRanks.findIndex((r) => r.name.toLowerCase() === (ms.rank || "").toLowerCase());
            if (currentIdx < 0 || currentIdx >= sortedRanks.length - 1) continue;

            // Delegate progress computation to the shared lib so this
            // dashboard box reports the exact same numbers as the admin
            // member profile, portal, promotions, and calendar sign-in.
            const progress = getStyleProgress(
              member.attendances as AttendanceRow[],
              {
                name: ms.name,
                rank: ms.rank,
                attendanceResetDate: ms.attendanceResetDate,
              },
              styleConfig.beltConfig,
            );
            let classRequirements = progress.requirements.map((r) => ({
              label: r.label,
              count: r.attended,
              required: r.required,
            }));

            // Legacy fallback: single numeric requirement on the Rank
            // row (styles that predate the classRequirements JSON).
            if (classRequirements.length === 0) {
              const currentRankRow = styleConfig.ranks.find(
                (r) => r.name.toLowerCase() === sortedRanks[currentIdx].name.toLowerCase()
              );
              if (currentRankRow?.classRequirement) {
                const styleAttendances = (member.attendances as AttendanceRow[]).filter(
                  (att) => attendanceCountsForStyle(att, {
                    name: ms.name,
                    rank: ms.rank,
                    attendanceResetDate: ms.attendanceResetDate,
                  }),
                );
                classRequirements = [{
                  label: "Classes",
                  count: styleAttendances.length,
                  required: currentRankRow.classRequirement,
                }];
              }
            }

            const allMet = classRequirements.length > 0
              && classRequirements.every((r) => r.count >= r.required);
            if (allMet) {
              const nextRank = sortedRanks[currentIdx + 1];
              eligibleForPromotion.push({
                memberId: member.id,
                memberName: `${member.firstName} ${member.lastName}`,
                styleName: ms.name,
                currentRank: sortedRanks[currentIdx].name,
                nextRank: nextRank.name,
                requirementsMet: classRequirements,
              });
            }
          }

          // Hard cap kept high so dashboard shows ALL eligible members
          // (frontend then paginates: top 10 in the box, rest via the
          // "View all" modal). 500 is well above any realistic gym
          // roster and just prevents runaway payload size.
          if (eligibleForPromotion.length >= 500) break;
        }
      }
    } catch (err) {
      console.error("Promotion eligibility check error:", err);
    }

    // --- Unread Member Messages ---
    // Every unread member-sent DirectMessage in this tenant, grouped
    // by conversation so we only surface the latest snippet per thread.
    // Admin can click through to /communication to reply.
    const unreadMemberMessages = await prisma.directMessage.findMany({
      where: {
        clientId,
        senderType: "member",
        isRead: false,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        conversationId: true,
        content: true,
        createdAt: true,
        senderId: true,
      },
    });
    // Collapse to one row per conversation (most recent unread wins).
    const seenConvos = new Set<string>();
    const uniqueUnread = unreadMemberMessages.filter((m) => {
      if (seenConvos.has(m.conversationId)) return false;
      seenConvos.add(m.conversationId);
      return true;
    });
    const senderIds = [...new Set(uniqueUnread.map((m) => m.senderId).filter((v): v is string => !!v))];
    const senders = senderIds.length > 0
      ? await prisma.member.findMany({
          where: { id: { in: senderIds }, clientId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const senderMap = new Map(senders.map((m) => [m.id, `${m.firstName} ${m.lastName}`.trim()]));
    const newMessages = uniqueUnread.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderName: m.senderId ? senderMap.get(m.senderId) || "Member" : "Member",
      snippet: m.content.length > 90 ? m.content.slice(0, 90).trimEnd() + "…" : m.content,
      createdAt: m.createdAt,
    }));

    // --- Low Stock Items ---
    const allPosItems = await prisma.pOSItem.findMany({
      where: { isActive: true, clientId },
      select: {
        id: true,
        name: true,
        quantity: true,
        reorderThreshold: true,
        variants: { select: { quantity: true } },
      },
    });
    const lowStockItems = allPosItems.filter(item => {
      const stock = item.variants.length > 0
        ? item.variants.reduce((sum, v) => sum + v.quantity, 0)
        : item.quantity;
      const threshold = item.reorderThreshold ?? 5;
      return stock > 0 && stock <= threshold;
    }).map(item => ({
      id: item.id,
      name: item.name,
      stock: item.variants.length > 0
        ? item.variants.reduce((sum, v) => sum + v.quantity, 0)
        : item.quantity,
      threshold: item.reorderThreshold ?? 5,
    }));

    // --- Active Trial Passes ---
    const activeTrials = await prisma.trialPass.findMany({
      where: { status: "ACTIVE", member: { clientId } },
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { expiresAt: "asc" },
      take: 10,
    });

    const trialsData = activeTrials.map((t) => ({
      id: t.id,
      memberId: t.member.id,
      memberName: `${t.member.firstName} ${t.member.lastName}`,
      classesUsed: t.classesUsed,
      maxClasses: t.maxClasses,
      expiresAt: t.expiresAt.toISOString(),
      daysRemaining: Math.max(0, Math.ceil((t.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
    }));

    return NextResponse.json({
      members: {
        total: totalMembers,
        active: activeMembers,
        prospects: prospectMembers,
        recent: recentMembers,
      },
      classesToday,
      attendance: {
        todayCount: todayAttendanceCount,
        recentCheckins,
      },
      tasks: {
        open: openTasks,
        overdueCount: overdueTasks,
      },
      revenue: {
        todayPosCents: todayPosRevenue,
        todayTransactionCount: todayTransactions.length,
        monthPosCents: monthTransactions._sum.totalCents || 0,
        monthTransactionCount: monthTransactions._count,
        monthlyRecurringRevenue,
        activeMembershipCount: activeMemberships.length,
      },
      billing: {
        pastDueCount,
        upcomingBillings,
        pastDueInvoices,
      },
      appointments: todaysAppointments,
      expiringMemberships,
      expiringSoonMemberships,
      lowStockItems,
      eligibleForPromotion,
      activeTrials: trialsData,
      newMessages,
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return new NextResponse("Failed to load dashboard", { status: 500 });
  }
}
