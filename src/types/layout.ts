// computeLayout() sonucunun tipi: Pixi görünümü ve DOM HUD yerleşimi bu veriyi paylaşır (değerler CSS pikselidir).
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface Pt {
  readonly x: number;
  readonly y: number;
}

interface LayoutBase {
  /** Sahne genişliği / yüksekliği. */
  readonly W: number;
  readonly H: number;
  /** Tahta hücre boyutu. */
  readonly cell: number;
  /** Önizleme hücre boyutu; miniBig ilk "Sıradaki" parçası içindir. */
  readonly mini: number;
  readonly miniBig: number;
  readonly board: Rect;
  readonly meter: Rect;
  readonly hold: Rect;
  readonly next: Rect;
  readonly stats: Rect;
  readonly btnHold: Rect;
  readonly btnCyc: Rect;
  readonly btnSneeze: Rect;
  readonly btnPause: Rect;
  readonly holdSlot: Pt;
  /** Portrede 2, yatayda 5 slot; okuyan kod indeks dışını `undefined` olarak ele almalıdır. */
  readonly nextSlots: readonly Pt[];
  readonly compactBtns: boolean;
  readonly compactStats: boolean;
}

export interface PortraitLayout extends LayoutBase {
  readonly portrait: true;
  readonly compactStats: true;
}
export interface LandscapeLayout extends LayoutBase {
  readonly portrait: false;
}
export type Layout = PortraitLayout | LandscapeLayout;
