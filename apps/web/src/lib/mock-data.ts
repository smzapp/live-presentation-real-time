export interface Slide {
  id: number;
  title: string;
  body: string;
}

export const SLIDES: Slide[] = [
  { id: 1, title: "Welcome", body: "Thanks for joining — let's get started." },
  { id: 2, title: "Agenda", body: "What we'll cover today, and what we want to leave with." },
  { id: 3, title: "Your turn", body: "Add your ideas on the board — I'll review them live." },
  { id: 4, title: "Wrap-up", body: "Key takeaways and next steps." },
];
