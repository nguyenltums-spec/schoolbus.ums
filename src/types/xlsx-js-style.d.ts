declare module 'xlsx-js-style' {
  export interface CellStyle {
    font?: {
      name?: string;
      sz?: number;
      bold?: boolean;
      italic?: boolean;
      color?: { rgb?: string };
    };
    fill?: {
      fgColor?: { rgb?: string };
      patternType?: string;
    };
    border?: {
      top?: { style: string; color?: { rgb?: string } };
      bottom?: { style: string; color?: { rgb?: string } };
      left?: { style: string; color?: { rgb?: string } };
      right?: { style: string; color?: { rgb?: string } };
    };
    alignment?: {
      horizontal?: 'left' | 'center' | 'right';
      vertical?: 'top' | 'center' | 'bottom';
      wrapText?: boolean;
    };
  }

  export interface CellObject {
    v?: string | number | boolean | Date;
    t?: 's' | 'n' | 'b' | 'd' | 'e' | 'z';
    s?: CellStyle;
    z?: string;
  }

  export interface WorkSheet {
    [cell: string]: unknown;
    '!merges'?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
    '!cols'?: Array<{ wch?: number; wpx?: number }>;
    '!rows'?: Array<{ hpt?: number; hpx?: number }>;
    '!pageSetup'?: Record<string, unknown>;
    '!margins'?: Record<string, number>;
  }

  export interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  }

  export const utils: {
    book_new: () => WorkBook;
    aoa_to_sheet: (data: Array<Array<string | number | CellObject | null | undefined>>) => WorkSheet;
    book_append_sheet: (wb: WorkBook, ws: WorkSheet, name: string) => void;
    encode_cell: (cell: { r: number; c: number }) => string;
  };

  export function writeFile(wb: WorkBook, filename: string, opts?: Record<string, unknown>): void;
}
