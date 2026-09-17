const PEOPLE = [
  { initials: "PS", name: "Priya", state: "Drawing", color: "#2f43d8", on: true },
  { initials: "MT", name: "Marcus", state: "Drawing", color: "#17864f", on: true },
  { initials: "SR", name: "Sara", state: "Drawing", color: "#e0483a", on: true },
  { initials: "DC", name: "Dana", state: "Hand raised", color: "#c98a12", on: false },
  { initials: "JL", name: "Jules", state: "Viewing", color: "#4a4c57", on: false },
];

const PENS = [
  { d: "M24 150 C 70 60, 120 170, 168 96", color: "#2f43d8", duration: "2.6s" },
  { d: "M196 60 C 250 40, 258 128, 310 104", color: "#17864f", duration: "3.2s" },
  { d: "M230 176 L 396 176", color: "#e0483a", duration: "2.2s" },
];

const FLOATING_CURSORS = [
  { name: "Priya", color: "#2f43d8", pos: { left: "4%", top: "48%" }, duration: "4.5s" },
  { name: "Marcus", color: "#17864f", pos: { left: "42%", top: "20%" }, duration: "5.6s" },
  { name: "Sara", color: "#e0483a", pos: { left: "30%", bottom: "2%" }, duration: "6.4s" },
  { name: "Dana", color: "#c98a12", pos: { right: "2%", top: "64%" }, duration: "5.1s" },
];

export function CursorTag({ name, color, big = false }: { name: string; color: string; big?: boolean }) {
  return (
    <span className="flex items-center gap-[5px]">
      <span
        className="h-0 w-0 border-b-transparent"
        style={{
          borderLeft: `${big ? 8 : 7}px solid ${color}`,
          borderBottom: `${big ? 11 : 10}px solid transparent`,
        }}
      />
      <span className="whitespace-nowrap rounded-[5px] px-[7px] py-0.5 text-[10px] text-white" style={{ background: color }}>
        {name}
      </span>
    </span>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`relative h-3 w-[22px] flex-none rounded-full ${on ? "bg-[#2f43d8]" : "bg-[#e6e5e0]"}`}>
      <span className="absolute top-0.5 h-2 w-2 rounded-full bg-white" style={{ left: on ? 12 : 2 }} />
    </span>
  );
}

// Decorative mock of a live room: several participants drawing on the same
// slide at once while the host panel lists who holds a pen.
export default function LiveRoomMockup({ code }: { code: string }) {
  return (
    <div className="relative min-w-0" aria-hidden>
      <div className="overflow-hidden rounded-[18px] border border-[rgba(21,22,28,.1)] bg-white shadow-[0_40px_80px_-30px_rgba(21,22,28,.32),0_4px_12px_rgba(21,22,28,.06)]">
        <div className="flex items-center gap-2.5 border-b border-[rgba(21,22,28,.08)] px-3.5 py-3">
          <div className="flex gap-[5px]">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-[9px] w-[9px] rounded-full bg-[#e6e5e0]" />
            ))}
          </div>
          <span className="ml-1.5 truncate text-[12.5px] font-medium text-[#4a4c57]">Q3 Strategy Review</span>
          <span className="lp-mono ml-auto inline-flex items-center gap-1.5 text-[10.5px] tracking-[.1em] text-[#e0483a]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#e0483a] [animation:lpPulse_1.8s_ease-in-out_infinite]" />
            LIVE
          </span>
          <span className="lp-mono text-[10.5px] tracking-[.12em] text-[#9a9ca6]">{code}</span>
        </div>

        <div className="flex min-h-[300px] min-w-0">
          <div className="hidden w-10 flex-col items-center gap-1 border-r border-[rgba(21,22,28,.07)] bg-[#fbfaf8] py-2.5 sm:flex">
            <div className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-[#2f43d8]">
              <div className="h-[9px] w-[9px] rotate-45 rounded-[2px] border-[1.5px] border-white" />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[26px] w-[26px] rounded-lg bg-[#efeee9]" />
            ))}
          </div>

          <div className="lp-grid relative min-w-0 flex-1 bg-[length:22px_22px] p-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="lp-display truncate text-base font-semibold tracking-[-.02em]">Slide 4 — sketch the flow</div>
              <span className="lp-mono flex-none whitespace-nowrap rounded-md border border-[#ccd2f7] bg-[#eef0fd] px-[7px] py-[3px] text-[9.5px] tracking-[.1em] text-[#2f43d8]">
                5 PENS
              </span>
            </div>

            <div className="absolute inset-[44px_12px_12px]">
              <svg viewBox="0 0 420 220" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none">
                {PENS.map((pen) => (
                  <path
                    key={pen.d}
                    d={pen.d}
                    stroke={pen.color}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray="400"
                    strokeDashoffset="400"
                    style={{ animation: `lpDraw ${pen.duration} ease-out infinite alternate` }}
                  />
                ))}
                <circle
                  cx="356"
                  cy="58"
                  r="26"
                  stroke="#c98a12"
                  strokeWidth="3.5"
                  strokeDasharray="400"
                  strokeDashoffset="400"
                  style={{ animation: "lpDraw 3.8s ease-out infinite alternate" }}
                />
              </svg>
              <div className="absolute left-[6%] top-[26%] h-[11px] w-16 rounded-[3px] bg-[#a6f3c4]" />
              <div className="absolute bottom-[4%] left-[40%] rounded-[7px] border-2 border-[#15161c] bg-white px-[9px] py-1 text-[11px] font-medium">
                handoff
              </div>

              {/* Full-size wrapper so the roam percentages move across the whole board. */}
              <div className="pointer-events-none absolute inset-0 [animation:lpRoam_13s_cubic-bezier(.45,.05,.55,.95)_infinite]">
                <div className="absolute left-0 top-0">
                  <CursorTag name="Aisha" color="#7b3fd8" big />
                </div>
              </div>
              {FLOATING_CURSORS.map((c) => (
                <div key={c.name} className="absolute" style={{ ...c.pos, animation: `lpFloat ${c.duration} ease-in-out infinite` }}>
                  <CursorTag name={c.name} color={c.color} />
                </div>
              ))}
            </div>
          </div>

          <div className="hidden w-[152px] flex-none flex-col gap-1.5 border-l border-[rgba(21,22,28,.07)] bg-[#fbfaf8] px-2.5 pb-4 pt-2.5 sm:flex">
            <div className="lp-mono text-[9px] tracking-[.12em] text-[#9a9ca6]">HOST · PARTICIPANTS</div>
            {PEOPLE.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-[7px] rounded-[9px] border border-[rgba(21,22,28,.09)] bg-white px-[7px] py-1.5"
              >
                <span
                  className="grid h-5 w-5 flex-none place-items-center rounded-full text-[8.5px] tracking-[.03em] text-white"
                  style={{ background: p.color }}
                >
                  {p.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10.5px] font-medium leading-tight">{p.name}</span>
                  <span className="block text-[9px] text-[#9a9ca6]">{p.state}</span>
                </span>
                <Toggle on={p.on} />
              </div>
            ))}
            <div className="mt-auto flex flex-col gap-[5px]">
              <div className="lp-mono text-center text-[9px] tracking-[.08em] text-[#9a9ca6]">24 IN ROOM · 5 DRAWING</div>
              <div className="rounded-lg bg-[#15161c] py-[7px] text-center text-[10.5px] text-[#f6f5f1]">Let everyone draw</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -top-[18px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[rgba(21,22,28,.1)] bg-white px-3.5 py-[7px] text-[12.5px] font-medium shadow-[0_8px_20px_rgba(21,22,28,.12)]">
        3 just joined
      </div>
      <div className="absolute -bottom-4 -left-2.5 whitespace-nowrap rounded-xl bg-[#a6f3c4] px-3.5 py-[9px] text-[12.5px] font-medium shadow-[0_10px_24px_rgba(21,22,28,.14)]">
        ✋ 3 hands raised
      </div>
    </div>
  );
}
