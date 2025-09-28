export type Book = {
  title: string;
  slug: string;
  dir: string;
  essays: ProcessedEssay[];
};

export type InputEssay = {
  dir: string;
  slug: string;
  title: string;
  url: string;
};

export type ProcessedEssay = InputEssay & { processed: true };
