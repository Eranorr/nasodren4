// İçerik tipleri. Metinler content/ altındadır ve değiştirilmemelidir.

/** Sağlık ipucu: [başlık, gövde]. */
export type HealthTip = readonly [title: string, body: string];

/** Rozet kimliği; fn_meta.badges içinde bu dizeler saklanır. */
export type BadgeId = 'ozmotik' | 'noro' | 'akis' | 'hapsu' | 'derin';

export interface BadgeDefinition {
  readonly id: BadgeId;
  readonly name: string;
  readonly desc: string;
}
