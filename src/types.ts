export type Section = {
  title: string;
  essaySlugs: string[];
};

export type Book = {
  title: string;
  slug: string;
  dir: string;
  essays: ProcessedEssay[];
  sections?: Section[];
  dedication?: string;
};

export type InputEssay = {
  dir: string;
  slug: string;
  title: string;
  url: string;
};

export type ProcessedEssay = InputEssay & { processed: true };
