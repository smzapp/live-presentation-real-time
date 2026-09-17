import type { Metadata } from "next";
import Link from "next/link";
import LandingHeader from "@/components/landing/LandingHeader";
import { LANDING_NAV } from "@/components/landing/nav";
import LiveRoomMockup, { CursorTag } from "@/components/landing/LiveRoomMockup";
import JoinCodeForm from "@/components/landing/JoinCodeForm";
import Logo from "@/components/landing/Logo";
import { lpFontVariables } from "@/components/landing/fonts";

export const metadata: Metadata = {
  title: "LivePresentation — Present virtually. Draw it together.",
  description:
    "Present your slides in a virtual room where every participant can draw on the board at the same time, while you host and manage the whole room from the browser.",
};

// Content knobs carried over from the design's editable props.
const SHOW_BANNER = true;
const CTA_LABEL = "Get started";
const DEMO_CODE = "6HKQNS";

const TRUST = [
  "Draw together in real time",
  "Join with a 6-letter code",
  "Unlimited live cursors",
  "Host manages who draws",
  "Runs in any browser",
];

const STAGE = ["AR", "MK", "LO", "JS"];

const CONTROLS = [
  { name: "Maya", role: "Can draw", on: true },
  { name: "Leo", role: "Hand raised", on: false },
  { name: "Jules", role: "Viewing", on: false },
];

const FORMATS = [".png", ".jpg", ".pdf", ".docx", "Q3 strategy", "Client pitches", "Onboarding training"];

const STEPS = [
  {
    n: "01",
    title: "Start a room",
    body: "Name your session and you're live. Load a saved deck or whiteboard, or begin from a blank canvas.",
    chip: "START SESSION",
  },
  {
    n: "02",
    title: "Share the code",
    body: "Everyone joins from their browser with a six-letter code or link. No downloads, no accounts for participants.",
    chip: DEMO_CODE,
  },
  {
    n: "03",
    title: "Collaborate live",
    body: "Present, draw, hand over the pen, review everyone's boards — then save the whole session for next time.",
    chip: "3 HANDS RAISED",
  },
];

const CASES = [
  {
    tag: "Business",
    title: "Meetings & reviews",
    body: "Walk stakeholders through the numbers, then mark up the chart together instead of talking over a static deck.",
    points: ["Slides and whiteboard in one room", "Live cursors show who's pointing where"],
  },
  {
    tag: "Sales",
    title: "Demos & pitches",
    body: "Keep prospects engaged by sketching their workflow live and inviting them to add to it.",
    points: ["Bring clients on camera", "Export the session as a PDF follow-up"],
  },
  {
    tag: "People ops",
    title: "Training & onboarding",
    body: "Give every trainee their own board for hands-on exercises, and check progress at a glance.",
    points: ["A personal board per participant", "Reuse saved decks for every cohort"],
  },
  {
    tag: "Product",
    title: "Workshops & brainstorms",
    body: "Hand the pen to the whole room and map ideas out together, then keep the result in a shared folder.",
    points: ["Let everyone draw at once", "Multi-page whiteboards"],
  },
  {
    tag: "Education",
    title: "Classrooms & tutoring",
    body: "Work problems through on the board while learners follow along, and spotlight great answers for the group.",
    points: ["Raised-hand alerts", "Control exactly who can draw"],
  },
  {
    tag: "Marketing",
    title: "Webinars & events",
    body: "Present to an audience that joins with just a link, and bring speakers on stage when it's their turn.",
    points: ["No installs or sign-ups to join", "Invite speakers on stage"],
  },
];

const SCHOOL_FACTS = [
  { stat: "0 accounts", label: "Students join with a code — no emails collected" },
  { stat: "40 seats", label: "Per room on the free classroom plan" },
  { stat: "Any device", label: "Chromebooks, tablets, lab desktops" },
];

const eyebrow = "lp-mono m-0 text-[11.5px] uppercase tracking-[.14em]";
const cardTitle = "lp-display text-[21px] font-semibold tracking-[-.02em]";
const cardBody = "text-[15px] leading-normal text-[#4a4c57]";
const iconTile = "h-[34px] w-[34px] flex-none rounded-[10px] border";

export default function LandingPage() {
  return (
    <div className={`lp ${lpFontVariables} min-h-screen w-full flex-1 overflow-x-hidden`}>
      {SHOW_BANNER && (
        <div className="flex flex-wrap items-center justify-center gap-3 bg-[#15161c] px-5 py-[11px] text-[13.5px] tracking-[.01em] text-[#f6f5f1]">
          <span className="lp-mono text-[11px] uppercase tracking-[.12em] text-[#a6f3c4]">New</span>
          <span className="opacity-[.82]">Classroom plan — unlimited student boards, free for schools</span>
          <a
            href="#classroom"
            className="border-b border-[rgba(246,245,241,.4)] pb-px text-[#f6f5f1] hover:text-[#a6f3c4]"
          >
            Read more →
          </a>
        </div>
      )}

      <LandingHeader ctaLabel={CTA_LABEL} />

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden px-6 pt-[76px]">
        <div
          className="absolute inset-0 bg-[length:34px_34px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,#000,transparent)]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(21,22,28,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(21,22,28,.045) 1px, transparent 1px)",
          }}
        />

        <div className="relative mx-auto grid max-w-[1180px] items-center gap-14 [grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr))]">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-[9px] rounded-full border border-[rgba(21,22,28,.1)] bg-white py-[7px] pl-[9px] pr-3.5 text-[13px] text-[#4a4c57] shadow-[0_2px_6px_rgba(21,22,28,.04)]">
              <span className="h-[7px] w-[7px] flex-none rounded-full bg-[#e0483a] [animation:lpPulse_1.8s_ease-in-out_infinite]" />
              Virtual presentations · everyone draws · one live room
            </div>

            <h1 className="lp-display mt-[22px] text-[clamp(44px,6.2vw,78px)] font-semibold leading-[.94] tracking-[-.035em] [text-wrap:balance]">
              Present virtually.
              <br />
              {/* A per-line background rather than one absolutely positioned bar,
                  so the mint marker stays under the words when the line wraps. */}
              <span
                className="[-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
                style={{
                  backgroundImage: "linear-gradient(#a6f3c4, #a6f3c4)",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "100% 12px",
                  backgroundPosition: "0 calc(100% - 4px)",
                }}
              >
                Draw it together.
              </span>
            </h1>

            <p className="mt-6 max-w-[30em] text-[18.5px] leading-[1.55] text-[#4a4c57] [text-wrap:pretty]">
              Present your slides in a virtual room where every participant can draw on the board at the same time —
              dozens of live pens on one canvas, while you host, watch and manage the whole room from the browser.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2.5 rounded-xl bg-[#2f43d8] px-[26px] py-[15px] text-base font-medium text-white shadow-[0_10px_24px_rgba(47,67,216,.26)] transition-colors hover:bg-[#15161c] hover:text-white"
              >
                Start a room — it&apos;s free
              </Link>
              <JoinCodeForm placeholder={DEMO_CODE} />
            </div>
            <p className="lp-mono mt-[18px] text-[11.5px] uppercase tracking-[.08em] text-[#9a9ca6]">
              No install · No sign-up for participants
            </p>
          </div>

          <LiveRoomMockup code={DEMO_CODE} />
        </div>

        <div className="relative mx-auto mt-16 flex max-w-[1180px] flex-wrap justify-between gap-x-7 gap-y-[18px] border-y border-[rgba(21,22,28,.1)] py-5">
          {TRUST.map((t) => (
            <span key={t} className="lp-mono text-[11.5px] uppercase tracking-[.1em] text-[#4a4c57]">
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="mx-auto max-w-[1180px] scroll-mt-20 px-6 pt-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[20em]">
            <p className={`${eyebrow} text-[#2f43d8]`}>Features</p>
            <h2 className="lp-display mt-3.5 text-[clamp(32px,4vw,48px)] font-semibold leading-[1.02] tracking-[-.03em] [text-wrap:balance]">
              Everything a live session needs, in one tab
            </h2>
          </div>
          <p className="m-0 max-w-[26em] text-[17px] leading-[1.55] text-[#4a4c57] [text-wrap:pretty]">
            No more juggling a video call, a deck and a separate whiteboard app. One room, in sync for everyone in it.
          </p>
        </div>

        <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col rounded-[18px] border border-[rgba(21,22,28,.1)] bg-white p-[26px] sm:col-span-2">
            <div className="flex items-start gap-3.5">
              <div className={`${iconTile} border-[#ccd2f7] bg-[#eef0fd]`} />
              <div>
                <h3 className={cardTitle}>Everyone draws at once — that&apos;s the edge</h3>
                <p className={`${cardBody} mt-2 max-w-[34em]`}>
                  Not one pen passed around: every participant draws on the same virtual board simultaneously, each with
                  their own colour and named cursor. Pens, highlighters, shapes and text on an infinite canvas, in sync
                  for the whole room.
                </p>
              </div>
            </div>
            <div className="lp-grid relative mt-[22px] min-h-[190px] flex-1 overflow-hidden rounded-xl border border-[rgba(21,22,28,.08)] bg-[#fbfaf8] bg-[length:20px_20px]">
              <svg viewBox="0 0 400 180" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
                <path
                  d="M20 130 C 80 40, 140 160, 200 90 S 320 20, 380 70"
                  stroke="#2f43d8"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="700"
                  strokeDashoffset="700"
                  style={{ animation: "lpDraw 3.4s ease-out forwards" }}
                />
              </svg>
              <div className="absolute left-[26%] top-[22%] h-3 w-[74px] rounded-[3px] bg-[#a6f3c4]" />
              <div className="absolute right-[12%] top-[40%] rounded-md border-2 border-[#15161c] bg-white px-2.5 py-[5px] text-xs font-medium">
                idea!
              </div>
              <div className="absolute bottom-[20%] left-[44%]">
                <CursorTag name="Sara" color="#e0483a" />
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col rounded-[18px] bg-[#15161c] p-[26px] text-[#f6f5f1]">
            <div className={`${iconTile} border-[rgba(246,245,241,.2)] bg-[rgba(246,245,241,.1)]`} />
            <h3 className={`${cardTitle} mt-4`}>Live video &amp; audio</h3>
            <p className="mt-2 text-[15px] leading-normal text-[rgba(246,245,241,.72)]">
              Bring people on stage with camera and mic when it&apos;s their turn to speak.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {STAGE.map((s) => (
                <div
                  key={s}
                  className="grid h-[62px] place-items-center rounded-[10px] border border-[rgba(246,245,241,.1)] bg-[#23252f] text-[13px] font-medium tracking-[.06em]"
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-[18px] border border-[rgba(21,22,28,.1)] bg-white p-[26px]">
            <div className={`${iconTile} border-[#ccd2f7] bg-[#eef0fd]`} />
            <h3 className={`${cardTitle} mt-4`}>Slides in sync</h3>
            <p className={`${cardBody} mt-2`}>
              Advance a slide and every screen follows instantly. Build decks right inside the app.
            </p>
            <div className="mt-5 flex gap-2">
              <div className="h-[50px] w-[74px] flex-none rounded-lg border-[1.5px] border-[#2f43d8] bg-[#eef0fd]" />
              <div className="h-[50px] w-[74px] flex-none rounded-lg border border-[rgba(21,22,28,.12)] bg-[#fbfaf8]" />
              <div className="h-[50px] w-[74px] flex-none rounded-lg border border-[rgba(21,22,28,.12)] bg-[#fbfaf8]" />
            </div>
          </div>

          <div className="min-w-0 rounded-[18px] border border-[rgba(21,22,28,.1)] bg-white p-[26px]">
            <div className={`${iconTile} border-[#a6f3c4] bg-[#dff7e9]`} />
            <h3 className={`${cardTitle} mt-4`}>A board for every participant</h3>
            <p className={`${cardBody} mt-2`}>
              Everyone gets a personal canvas for exercises — see them all at a glance, spotlight one for the room.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-[7px]">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className={`h-10 rounded-lg ${
                    i === 4 ? "border-[1.5px] border-[#2f43d8] bg-[#eef0fd]" : "border border-[rgba(21,22,28,.12)] bg-[#fbfaf8]"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-[18px] border border-[rgba(21,22,28,.1)] bg-white p-[26px]">
            <div className={`${iconTile} border-[#ccd2f7] bg-[#eef0fd]`} />
            <h3 className={`${cardTitle} mt-4`}>Host view &amp; room management</h3>
            <p className={`${cardBody} mt-2`}>
              See every participant in one list: who&apos;s drawing, who&apos;s raised a hand, who&apos;s just watching.
              Grant or revoke the pen, mute, spotlight or remove anyone — mid-sentence.
            </p>
            <div className="mt-5 flex flex-col gap-[7px]">
              {CONTROLS.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center gap-2.5 rounded-[10px] border border-[rgba(21,22,28,.1)] px-[11px] py-[9px] text-[13.5px]"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-[12.5px] text-[#9a9ca6]">{c.role}</span>
                  <span className={`relative ml-auto h-[17px] w-[30px] rounded-full ${c.on ? "bg-[#2f43d8]" : "bg-[#e6e5e0]"}`}>
                    <span className="absolute top-0.5 h-[13px] w-[13px] rounded-full bg-white" style={{ left: c.on ? 15 : 2 }} />
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-6 rounded-[18px] border border-[rgba(21,22,28,.1)] bg-white p-[26px] sm:col-span-2">
            <div className="min-w-0 flex-[1_1_240px]">
              <h3 className={cardTitle}>Save it, reuse it, share it</h3>
              <p className={`${cardBody} mt-2`}>
                Keep boards and decks in folders, pick up where you left off next session, export drawings as handouts.
              </p>
            </div>
            <div className="flex flex-wrap gap-[7px]">
              {FORMATS.map((f) => (
                <span
                  key={f}
                  className="lp-mono rounded-lg border border-[rgba(21,22,28,.14)] bg-[#fbfaf8] px-[11px] py-[7px] text-[11.5px] text-[#4a4c57]"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="mt-24 scroll-mt-16 bg-[#15161c] px-6 py-[88px] text-[#f6f5f1]">
        <div className="mx-auto max-w-[1180px]">
          <p className={`${eyebrow} text-[#a6f3c4]`}>How it works</p>
          <h2 className="lp-display mt-3.5 max-w-[20em] text-[clamp(32px,4.4vw,52px)] font-semibold leading-[1.02] tracking-[-.03em]">
            Live in under ten seconds
          </h2>
          <p className="mt-4 max-w-[34em] text-[17px] leading-[1.55] text-[rgba(246,245,241,.7)]">
            Nothing for your audience to install. Start a room, share the code, and you&apos;re presenting.
          </p>

          <div className="mt-12 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="flex flex-col rounded-2xl border border-[rgba(246,245,241,.14)] bg-[rgba(246,245,241,.035)] p-6"
              >
                <span className="lp-mono text-[11.5px] tracking-[.14em] text-[#a6f3c4]">{s.n}</span>
                <h3 className="lp-display mt-3.5 text-[22px] font-semibold tracking-[-.02em]">{s.title}</h3>
                <p className="mb-5 mt-2.5 text-[15px] leading-[1.55] text-[rgba(246,245,241,.7)]">{s.body}</p>
                <div className="lp-mono mt-auto inline-flex items-center gap-2 self-start rounded-[10px] border border-[rgba(246,245,241,.18)] px-3.5 py-[9px] text-xs tracking-[.1em]">
                  {s.chip}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Use cases ---------- */}
      <section id="usecases" className="mx-auto max-w-[1180px] scroll-mt-20 px-6 pt-24">
        <p className={`${eyebrow} text-[#2f43d8]`}>Use cases</p>
        <h2 className="lp-display mt-3.5 max-w-[18em] text-[clamp(32px,4.4vw,52px)] font-semibold leading-[1.02] tracking-[-.03em]">
          Built for anyone who has a room to hold
        </h2>

        <div className="mt-11 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(290px,100%),1fr))]">
          {CASES.map((c) => (
            <div
              key={c.title}
              className="flex min-w-0 flex-col rounded-[18px] border border-[rgba(21,22,28,.1)] bg-white p-6 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-[rgba(47,67,216,.45)]"
            >
              <span className="lp-mono text-[10.5px] uppercase tracking-[.14em] text-[#9a9ca6]">{c.tag}</span>
              <h3 className="lp-display mt-3 text-xl font-semibold tracking-[-.02em]">{c.title}</h3>
              <p className="mb-[18px] mt-2 text-[14.5px] leading-[1.55] text-[#4a4c57]">{c.body}</p>
              <div className="mt-auto flex flex-col gap-2 border-t border-[rgba(21,22,28,.08)] pt-3.5">
                {c.points.map((p) => (
                  <div key={p} className="flex items-start gap-[9px] text-[13.5px]">
                    <span className="mt-0.5 h-[15px] w-[15px] flex-none rounded-full border border-[#a6f3c4] bg-[#dff7e9]" />
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- For schools ---------- */}
      <section id="classroom" className="mx-auto mt-24 max-w-[1180px] scroll-mt-20 px-6">
        <div className="grid items-center gap-9 rounded-[22px] bg-[#a6f3c4] p-7 sm:p-11 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
          <div className="min-w-0">
            <p className={`${eyebrow} opacity-60`}>For schools</p>
            <h2 className="lp-display mt-3.5 text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-.03em]">
              Free for every classroom, forever
            </h2>
            <p className="mt-3.5 max-w-[28em] text-[16.5px] leading-[1.55] text-[#1d3b2a]">
              Students join with a six-letter code from any school device. No accounts, no email addresses collected,
              and every board stays in the teacher&apos;s folder.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex rounded-xl bg-[#15161c] px-6 py-3.5 text-[15.5px] font-medium text-[#f6f5f1] transition-colors hover:bg-[#2f43d8] hover:text-white"
            >
              Claim a classroom plan →
            </Link>
          </div>
          <div className="flex min-w-0 flex-col gap-2.5">
            {SCHOOL_FACTS.map((f) => (
              <div key={f.stat} className="rounded-xl bg-white/[.72] px-[18px] py-4">
                <div className="lp-display text-[26px] font-bold tracking-[-.02em]">{f.stat}</div>
                <div className="mt-[3px] text-[13.5px] text-[#1d3b2a]">{f.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="mx-auto mt-6 max-w-[1180px] px-6">
        <div className="relative overflow-hidden rounded-[22px] bg-[#2f43d8] px-8 py-[clamp(40px,6vw,72px)] text-center">
          <div
            className="absolute inset-0 bg-[length:34px_34px]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)",
            }}
          />
          <div className="relative">
            <h2 className="lp-display m-0 text-[clamp(32px,5vw,60px)] font-semibold leading-[1.02] tracking-[-.035em] text-white [text-wrap:balance]">
              Your next presentation
              <br />
              could start right now.
            </h2>
            <p className="mx-auto mt-[18px] max-w-[32em] text-[17.5px] leading-[1.55] text-white/[.82]">
              Open a room, share the code, and see how much more gets done when everyone can draw along.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/dashboard"
                className="rounded-xl bg-white px-[26px] py-[15px] text-base font-medium text-[#15161c] transition-colors hover:bg-[#a6f3c4] hover:text-[#15161c]"
              >
                Start presenting →
              </Link>
              <JoinCodeForm tone="blue" placeholder="Have a code?" />
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto mt-[72px] flex max-w-[1180px] flex-wrap items-center gap-x-8 gap-y-[18px] border-t border-[rgba(21,22,28,.1)] px-6 pb-14 pt-11">
        <div className="mr-auto flex items-center gap-2.5">
          <Logo size="sm" />
          <span className="lp-display text-[15px] font-bold tracking-[-.02em]">LivePresentation</span>
        </div>
        <div className="flex flex-wrap gap-[22px] text-sm text-[#4a4c57]">
          {LANDING_NAV.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-[#15161c]">
              {l.label}
            </a>
          ))}
        </div>
        <span className="text-[13.5px] text-[#9a9ca6]">© {new Date().getFullYear()} LivePresentation</span>
      </footer>
    </div>
  );
}
