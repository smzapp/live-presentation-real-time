export interface Slide {
  id: number;
  title: string;
  body: string;
}

export const SLIDES: Slide[] = [
  { id: 1, title: "Welcome", body: "Today we're solving quadratic equations together." },
  { id: 2, title: "Warm-up", body: "Try factoring: x² + 5x + 6 = 0" },
  { id: 3, title: "Your turn", body: "Draw your work on the board — I'll review live." },
  { id: 4, title: "Recap", body: "Great work! Let's go over the common mistakes." },
];
