// Popular colour wheels players build from, to drop into the NoMu Wheels
// habitats and check against the recorded pairs. Each lists one secondary per
// base colour by name, in the order the habitats fill (8 / 8 / 7).
//
// These are curated rather than computed: the community pairs each base with
// the secondary that looks closest in game, which plain RGB distance doesn't
// reproduce (and Chroma has no single colour).

export interface WheelPreset {
  name:        string;
  description: string;
  frogs:       [base: string, sec: string][];
}

export const WHEEL_PRESETS: WheelPreset[] = [
  {
    name: 'Similar colours',
    description: 'Each base with its closest-looking secondary, blues and purples first',
    frogs: [
      ['Marine', 'Callaina'], ['Aqua', 'Callaina'], ['Azure', 'Caelus'], ['Blue', 'Caelus'],
      ['Purple', 'Pruni'], ['Royal', 'Viola'], ['Pink', 'Floris'], ['Violet', 'Floris'],
      ['Maroon', 'Tingo'], ['Red', 'Carota'], ['Tangelo', 'Carota'], ['Orange', 'Ceres'],
      ['Golden', 'Aurum'], ['Yellow', 'Aurum'], ['Lime', 'Folium'], ['Green', 'Folium'],
      ['Emerald', 'Muscus'], ['Olive', 'Bruna'], ['Beige', 'Bruna'], ['Cocos', 'Cafea'],
      ['Black', 'Picea'], ['White', 'Albeo'], ['Glass', 'Chroma'],
    ],
  },
  {
    name: 'Color Wheel Chart',
    description: 'The community Color Wheel Chart, in rainbow order',
    frogs: [
      ['Maroon', 'Tingo'], ['Red', 'Tingo'], ['Tangelo', 'Carota'], ['Orange', 'Carota'],
      ['Golden', 'Aurum'], ['Yellow', 'Aurum'], ['Lime', 'Folium'], ['Green', 'Folium'],
      ['Emerald', 'Muscus'], ['Olive', 'Muscus'], ['Marine', 'Callaina'], ['Aqua', 'Callaina'],
      ['Azure', 'Caelus'], ['Blue', 'Caelus'], ['Purple', 'Pruni'], ['Royal', 'Viola'],
      ['Pink', 'Ceres'], ['Violet', 'Floris'], ['White', 'Albeo'], ['Beige', 'Bruna'],
      ['Cocos', 'Cafea'], ['Black', 'Picea'], ['Glass', 'Chroma'],
    ],
  },
];
