/**
 * The emojis offered in Group settings, by theme. Each has a spoken name for screen readers.
 * Every entry is a single emoji that passes groupSchema's emoji check.
 */
export const GROUP_EMOJIS: readonly { emoji: string; name: string }[] = [
  // Trips
  { emoji: "✈️", name: "Plane" },
  { emoji: "🏖️", name: "Beach" },
  { emoji: "🏔️", name: "Mountain" },
  { emoji: "⛺", name: "Tent" },
  { emoji: "🚗", name: "Car" },
  { emoji: "🚆", name: "Train" },
  { emoji: "🗺️", name: "Map" },
  { emoji: "🧳", name: "Luggage" },
  // Home
  { emoji: "🏠", name: "House" },
  { emoji: "🛋️", name: "Sofa" },
  { emoji: "🔑", name: "Key" },
  { emoji: "🛒", name: "Shopping cart" },
  { emoji: "💡", name: "Light bulb" },
  { emoji: "🐶", name: "Dog" },
  // Food and drink
  { emoji: "🍕", name: "Pizza" },
  { emoji: "🍔", name: "Burger" },
  { emoji: "🍣", name: "Sushi" },
  { emoji: "🍳", name: "Cooking" },
  { emoji: "☕", name: "Coffee" },
  { emoji: "🍻", name: "Beers" },
  { emoji: "🍷", name: "Wine" },
  // Sports
  { emoji: "⚽", name: "Football" },
  { emoji: "🏀", name: "Basketball" },
  { emoji: "🎾", name: "Tennis" },
  { emoji: "🚴", name: "Cycling" },
  { emoji: "🏂", name: "Snowboarding" },
  // Celebrations
  { emoji: "🎉", name: "Party" },
  { emoji: "🎂", name: "Birthday cake" },
  { emoji: "🎄", name: "Christmas tree" },
  { emoji: "💍", name: "Wedding ring" },
  { emoji: "🎁", name: "Gift" },
  { emoji: "🎵", name: "Music" },
];
