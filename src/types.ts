export type BookContent =
  | { type: "essay"; essay: ProcessedEssay }
  | { type: "latex"; content: string };

export type Book = {
  title: string;
  slug: string;
  dir: string;
  contents: BookContent[];
};

export type InputEssay = {
  dir: string;
  slug: string;
  title: string;
  url: string;
};

export type ProcessedEssay = InputEssay & { processed: true };
