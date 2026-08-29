import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";

type UserAvatarProps = {
  avatarUrl?: string | null;
  name?: string | null;
  className?: string;
  iconClassName?: string;
};

/** Shows the user's uploaded avatar and falls back to a neutral icon, never initials. */
export default function UserAvatar({
  avatarUrl,
  name = "Ảnh đại diện tài khoản",
  className = "h-10 w-10",
  iconClassName = "h-5 w-5",
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-violet-100 text-violet-600 ${className}`}
    >
      {avatarUrl && !imageFailed ? (
        <img
          src={avatarUrl}
          alt={name || "Ảnh đại diện tài khoản"}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <UserRound className={iconClassName} aria-hidden="true" />
      )}
    </span>
  );
}
