import {
  Home, Zap, Wifi, ShoppingBasket, Utensils, Car, Fuel, TrainFront, HeartPulse, ShoppingBag, Clapperboard, Repeat, Plane, GraduationCap, Sparkles, Gift, Receipt, CircleDashed, Briefcase, Laptop, Percent, RotateCcw, PlusCircle,
  Dumbbell, BookOpen, Droplets, ChefHat, Wallet, Moon, Sun, Brain, Footprints, Bike, Music, PenLine, Leaf, Coffee, Bed, Target, Tag,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: Home, zap: Zap, wifi: Wifi, "shopping-basket": ShoppingBasket, utensils: Utensils, car: Car, fuel: Fuel, train: TrainFront, "heart-pulse": HeartPulse, "shopping-bag": ShoppingBag, clapperboard: Clapperboard, repeat: Repeat, plane: Plane, "graduation-cap": GraduationCap, sparkles: Sparkles, gift: Gift, receipt: Receipt, "circle-dashed": CircleDashed, briefcase: Briefcase, laptop: Laptop, percent: Percent, "rotate-ccw": RotateCcw, "plus-circle": PlusCircle,
  dumbbell: Dumbbell, "book-open": BookOpen, droplets: Droplets, "chef-hat": ChefHat, wallet: Wallet, moon: Moon, sun: Sun, brain: Brain, footprints: Footprints, bike: Bike, music: Music, "pen-line": PenLine, leaf: Leaf, coffee: Coffee, bed: Bed, target: Target, tag: Tag,
};

export const CATEGORY_ICONS = Object.keys(ICONS).slice(0, 23);
export const HABIT_ICONS = ["dumbbell", "book-open", "droplets", "chef-hat", "wallet", "moon", "sun", "brain", "footprints", "bike", "music", "pen-line", "leaf", "coffee", "bed", "target"];

export function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Tag;
  return <C className={className} aria-hidden />;
}

/** Coloured rounded square with an icon — used for categories, habits, accounts. */
export function IconTile({ name, color, size = "md" }: { name: string; color: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "size-7 [&_svg]:size-3.5" : size === "lg" ? "size-10 [&_svg]:size-5" : "size-8 [&_svg]:size-4";
  return (
    <span className={`grid shrink-0 place-items-center rounded-md ${s}`} style={{ background: `${color}1f`, color }}>
      <Icon name={name} />
    </span>
  );
}
