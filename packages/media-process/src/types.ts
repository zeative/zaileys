export type StickerShapeType = 'circle' | 'rounded' | 'oval' | 'default';

export interface StickerMetadataType {
  packageName?: string;
  authorName?: string;
  quality?: number;
  shape?: StickerShapeType;
}
