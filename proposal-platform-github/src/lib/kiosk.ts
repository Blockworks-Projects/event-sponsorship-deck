// The kiosk offer, mirroring slide 8 of the builder deck ([KISOK_TEMPLATE]]).
//
// Rendered as real page content rather than the slide image: the image is a
// 16:9 screenshot that reads as a pasted-in slide next to the rest of the
// proposal, and its text can't reflow on a phone.
//
// London only. Asia has no kiosk in its tiers.
export const KIOSK = {
  title: 'Kiosk',
  // The render from the slide, cropped out of it and stored on its own so it
  // can sit beside the copy at a sensible size instead of being a 16:9 slide.
  image:
    'https://mledzbwuryqcusgsnszj.supabase.co/storage/v1/object/public/sponsorship-images/brand/kiosk.png',
  points: [
    'Fully customizable 1.22m (W) × 1.98m (H) demo pod',
    'Branded plinth for product displays, marketing materials, or giveaways',
    'Integrated 42" screen for live demos, presentations, and video content',
  ],
};
