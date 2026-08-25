type TimiLogoProps = {
  className?: string;
  alt?: string;
};

/** Shared Timi brand mark. The asset is copied from public/ to the site root. */
export default function TimiLogo({ className = "h-full w-full", alt = "Timi" }: TimiLogoProps) {
  return <img src="/logo.png" alt={alt} className={`object-cover ${className}`} />;
}
