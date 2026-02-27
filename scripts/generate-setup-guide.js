const { jsPDF } = require("jspdf");

const doc = new jsPDF();
const pageWidth = doc.internal.pageSize.getWidth();
const margin = 20;
const contentWidth = pageWidth - margin * 2;
let y = 20;

function checkPage(needed = 20) {
  if (y + needed > 275) {
    doc.addPage();
    y = 20;
  }
}

function title(text) {
  checkPage(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(180, 30, 30);
  doc.text(text, pageWidth / 2, y, { align: "center" });
  y += 12;
}

function subtitle(text) {
  checkPage(20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(text, pageWidth / 2, y, { align: "center" });
  y += 10;
}

function sectionHeader(num, text) {
  checkPage(25);
  y += 6;
  doc.setFillColor(180, 30, 30);
  doc.roundedRect(margin, y - 5, contentWidth, 10, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(`Step ${num}: ${text}`, margin + 4, y + 2);
  y += 14;
}

function paragraph(text) {
  checkPage(15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const lines = doc.splitTextToSize(text, contentWidth);
  doc.text(lines, margin, y);
  y += lines.length * 5 + 3;
}

function bullet(text) {
  checkPage(12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const lines = doc.splitTextToSize(text, contentWidth - 10);
  doc.setFillColor(180, 30, 30);
  doc.circle(margin + 2, y - 1.2, 1.2, "F");
  doc.text(lines, margin + 8, y);
  y += lines.length * 5 + 2;
}

function tip(text) {
  checkPage(18);
  doc.setFillColor(255, 245, 230);
  const lines = doc.splitTextToSize(text, contentWidth - 16);
  const boxH = lines.length * 5 + 8;
  doc.roundedRect(margin, y - 4, contentWidth, boxH, 2, 2, "F");
  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(9);
  doc.setTextColor(160, 100, 20);
  doc.text("TIP: " + lines[0], margin + 4, y + 1);
  if (lines.length > 1) {
    doc.setFont("helvetica", "italic");
    for (let i = 1; i < lines.length; i++) {
      doc.text(lines[i], margin + 4, y + 1 + i * 5);
    }
  }
  y += boxH + 4;
}

function spacer(h = 4) { y += h; }

// ============ CONTENT ============

title("Dojo Storm Software");
subtitle("New Client Setup Guide");
spacer(4);

doc.setDrawColor(180, 30, 30);
doc.setLineWidth(0.5);
doc.line(margin, y, pageWidth - margin, y);
y += 8;

paragraph("Welcome to Dojo Storm! This guide walks you through setting up your gym in the best order so everything connects smoothly. Follow these steps in order — each one builds on the previous.");
spacer(4);

// ---- STEP 1 ----
sectionHeader(1, "Complete Your Account Setup");
paragraph("After your first login, you'll be prompted to set your name, email, and password. Once on the dashboard, go to Account Settings (click your name in the top-right corner).");
spacer(2);
bullet("Business Details — Enter your gym name, address, phone, email, website, timezone, and upload your logo.");
bullet("Display Settings — Choose your preferred date format, time format, and week start day. Toggle dark/light theme.");
bullet("Billing Settings — Enable auto-invoicing and configure dunning (automatic payment retry) if desired.");
tip("Complete your Business Details first — your gym name and logo appear throughout the software and on member-facing pages.");

// ---- STEP 2 ----
sectionHeader(2, "Set Up Email Notifications");
paragraph("Go to Account Settings > Notifications tab. Enter your Resend API key to enable email features (magic link login for members, invoices, reminders, etc.).");
spacer(2);
bullet("Sign up for a free Resend account at resend.com if you don't have one.");
bullet("Create an API key in your Resend dashboard and paste it here.");
bullet("Toggle on/off individual notification types (welcome emails, invoice emails, class reminders, etc.).");
tip("Without a Resend API key, your members won't be able to log into the Member Portal. Set this up early!");

// ---- STEP 3 ----
sectionHeader(3, "Add Locations & Training Spaces");
paragraph("If your gym has multiple locations or distinct training areas, set those up now. Go to Settings > Locations and Settings > Spaces.");
spacer(2);
bullet("Locations — Add each physical gym location with name and address.");
bullet("Spaces — Add training rooms or mat areas within each location (e.g., \"Main Mat\", \"Weight Room\").");
tip("Even if you have one location, adding it now means classes and appointments will be properly tagged.");

// ---- STEP 4 ----
sectionHeader(4, "Create Your Martial Arts Styles");
paragraph("Go to the Styles page to create your martial arts programs (e.g., Karate, BJJ, Muay Thai, Kempo). This must be done before setting up belt ranks, curriculum, or classes.");
spacer(2);
bullet("Add each style with a name and description.");
bullet("Enable the belt system if the style uses belt ranks.");
bullet("Use the Belt Designer to configure how belts look (colors, stripes, patches).");
bullet("Add belt ranks in order from lowest to highest.");
tip("Styles are the foundation — classes, curriculum, testing, and member progress all depend on them.");

// ---- STEP 5 ----
sectionHeader(5, "Build Your Curriculum");
paragraph("With your styles and belt ranks in place, go to the Curriculum page to define what students need to learn for each rank.");
spacer(2);
bullet("Create curriculum content organized by style and rank.");
bullet("Set class attendance requirements for rank advancement.");
bullet("Upload PDF documents for each rank's curriculum if desired.");
tip("Curriculum connects to student progress tracking — members can see what they need to learn for their next belt on the portal.");

// ---- STEP 6 ----
sectionHeader(6, "Create Membership Plans");
paragraph("Go to the Memberships page to set up your pricing tiers. These are what members will sign up for.");
spacer(2);
bullet("Create plans with name, price, and billing cycle (monthly, yearly, per-session, one-time).");
bullet("Set contract length, auto-renewal, and cancellation terms.");
bullet("Choose which styles each plan includes access to.");
bullet("Set class limits if applicable (e.g., 2 classes/week for a basic plan).");
bullet("Configure setup fees, trial periods, and family discounts.");
tip("Make plans available on the portal if you want members to self-enroll online.");

// ---- STEP 7 ----
sectionHeader(7, "Set Up Waiver Templates");
paragraph("Go to the Waivers page to create your liability waiver templates. These will be signed by new members during enrollment.");
spacer(2);
bullet("Create adult and minor/guardian waiver templates.");
bullet("Customize waiver text, sections, and required fields.");
bullet("Waivers integrate with the online enrollment wizard and can be signed on any device.");
tip("Members signing up through the portal will be asked to sign waivers automatically during enrollment.");

// ---- STEP 8 ----
sectionHeader(8, "Schedule Your Classes");
paragraph("Go to the Classes page to build your weekly class schedule. You'll need styles and locations created first.");
spacer(2);
bullet("Create classes with name, style, coach, time, and location.");
bullet("Set up recurring schedules (daily, weekly patterns).");
bullet("Set maximum capacity for each class to enable waitlists.");
bullet("Assign colors for visual grouping on the calendar.");
tip("Classes appear on both the admin Calendar and the Member Portal for booking.");

// ---- STEP 9 ----
sectionHeader(9, "Configure the Member Portal");
paragraph("Go to Portal Settings to control what members see and can do when they log in to the portal.");
spacer(2);
bullet("Toggle features on/off: class booking, messages, billing history, attendance, belt progress, etc.");
bullet("Members access the portal at your URL + /portal/login (e.g., app.yourdomain.com/portal/login).");
bullet("Members log in via magic link email — no passwords to remember.");
tip("Test the portal yourself by adding your own email as a member and logging in.");

// ---- STEP 10 ----
sectionHeader(10, "Add Your Staff & Coaches");
paragraph("Go to Account Settings > Role Assignments to add staff accounts and assign permissions.");
spacer(2);
bullet("OWNER — Full access to everything (that's you).");
bullet("ADMIN — Full access except account/system settings.");
bullet("COACH — Access to dashboard, members, classes, calendar, testing, curriculum, tasks.");
bullet("FRONT DESK — Access to dashboard, members, memberships, classes, calendar, POS, waivers, kiosk.");
tip("Each role sees only the features they need — coaches won't see billing or reports.");

// ---- STEP 11 ----
sectionHeader(11, "Set Up POS & Inventory");
paragraph("Go to POS > Items to add products you sell (uniforms, equipment, gear, supplements).");
spacer(2);
bullet("Add items with name, price, and current stock quantity.");
bullet("Set reorder thresholds to get low-stock alerts on the dashboard.");
bullet("Process sales through the POS checkout.");
tip("POS transactions are tracked per member if you select one during checkout.");

// ---- STEP 12 ----
sectionHeader(12, "Add Your Members");
paragraph("Now you're ready to add members! Go to the Members page and start adding them manually, or have them self-enroll through the portal.");
spacer(2);
bullet("Manual — Click \"Add Member\" and enter their info, assign a membership plan and style.");
bullet("Portal Enrollment — Members go to your portal URL, fill out the enrollment wizard (select plan, enter info, sign waiver), and you approve them from the Enrollments page.");
bullet("Kiosk — Set up a tablet at the front desk for class check-ins at /kiosk.");
tip("Once a member is added with an email, they can immediately access the Member Portal.");

// ---- FOOTER ----
checkPage(30);
spacer(8);
doc.setDrawColor(180, 30, 30);
doc.setLineWidth(0.5);
doc.line(margin, y, pageWidth - margin, y);
y += 8;

doc.setFont("helvetica", "bold");
doc.setFontSize(11);
doc.setTextColor(180, 30, 30);
doc.text("You're all set!", pageWidth / 2, y, { align: "center" });
y += 7;
doc.setFont("helvetica", "normal");
doc.setFontSize(10);
doc.setTextColor(80, 80, 80);
const closing = doc.splitTextToSize(
  "Your gym is now configured and ready to go. As you use the software, you'll discover additional features like the reports dashboard, audit log, promo codes, appointment scheduling, and more. If you need help, reach out to your Dojo Storm representative.",
  contentWidth
);
doc.text(closing, pageWidth / 2, y, { align: "center" });

// ---- PAGE NUMBERS ----
const totalPages = doc.internal.getNumberOfPages();
for (let i = 1; i <= totalPages; i++) {
  doc.setPage(i);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Dojo Storm Software — Setup Guide`, margin, 290);
  doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, 290, { align: "right" });
}

doc.save("Dojo_Storm_Setup_Guide.pdf");
console.log("PDF saved: Dojo_Storm_Setup_Guide.pdf");
