import type { CoverType } from "./cover";

export type Book = {
  title: string;
  slug: string;
  dir: string;
  essays: ProcessedEssay[];
  coverFn?: (outputPath: string, book: Book, coverType: CoverType) => Promise<void>;
  titlePageFn?: () => string;
  buildChaptersFn?: (essays: ProcessedEssay[]) => string[];
};

export type InputEssay = {
  dir: string;
  slug: string;
  title: string;
  url: string;
};

export type ProcessedEssay = InputEssay & { processed: true };
